import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common"
import { Counter } from "@opentelemetry/api"
import ms from "ms"
import { MetricService } from "nestjs-otel"
import { CpuMonitorService } from "./cpu-monitor.service"
import { ScheduleMetricsService } from "./schedule-metrics.service"
import { ScheduleGateway } from "./schedule.gateway"

const duration = (key: string, fallbackMs: number): number => {
  const value = process.env[key]
  return value ? ms(value as ms.StringValue) : fallbackMs
}

const number = (key: string, fallback: number): number => {
  const value = process.env[key]
  return value === undefined ? fallback : Number(value)
}

@Injectable()
export class ConnectionSheddingService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ConnectionSheddingService.name)

  private readonly enabled = process.env.SHED_ENABLED === "true"
  private readonly highWaterUtilization = number("SHED_CPU_HIGH_WATER", 0.0625)
  private readonly batchSize = number("SHED_BATCH_SIZE", 10)
  private readonly minConnections = number("SHED_MIN_CONNECTIONS", 50)
  private readonly shareMargin = number("SHED_SHARE_MARGIN", 0.2)
  private readonly evalIntervalMs = duration("SHED_EVAL_INTERVAL", 10_000)
  private readonly cooldownMs = duration("SHED_COOLDOWN", 60_000)
  private readonly closeCode = number("SHED_CLOSE_CODE", 1001)
  private readonly drainBatchIntervalMs = duration(
    "SHED_DRAIN_BATCH_INTERVAL",
    1_000,
  )
  private readonly drainTimeoutMs = duration("SHED_DRAIN_TIMEOUT", 30_000)

  private readonly shedCounter: Counter

  private lastShedAt = 0
  private draining = false
  private evaluating = false
  private evalTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly cpuMonitor: CpuMonitorService,
    private readonly gateway: ScheduleGateway,
    private readonly metricsService: ScheduleMetricsService,
    metricService: MetricService,
  ) {
    this.shedCounter = metricService.getCounter("connection_shed_total", {
      description: "Connections closed by the load shedder",
      unit: "connections",
    })
  }

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log("Connection shedding disabled (set SHED_ENABLED=true)")
      return
    }

    this.evalTimer = setInterval(
      () => void this.evaluate(),
      this.evalIntervalMs,
    )
    this.evalTimer.unref?.()
    this.logger.log(
      `Connection shedding enabled: highWater=${(this.highWaterUtilization * 100).toFixed(1)}%, ` +
        `shareMargin=${this.shareMargin}, batch=${this.batchSize}, floor=${this.minConnections}, ` +
        `cooldown=${this.cooldownMs}ms`,
    )
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.drain()
  }

  private async evaluate(): Promise<void> {
    if (this.draining || this.evaluating || !this.cpuMonitor.windowReady) {
      return
    }

    // check if we've reached the CPU threshold before doing the work to get fleet stats and shed connections
    const utilization = this.cpuMonitor.averageUtilization
    if (utilization <= this.highWaterUtilization) {
      return
    }

    this.evaluating = true
    try {
      const hot = `${(utilization * 100).toFixed(1)}%`

      const connections = this.gateway.connectionCount
      if (connections <= this.minConnections) {
        this.logger.warn(
          `Hot (${hot}) at connection floor ${this.minConnections}; not shedding`,
        )
        return
      }

      // check if connections are unbalanced
      const stats = await this.metricsService.getFleetConnectionStats()
      if (!stats) {
        this.logger.warn(
          `Hot (${hot}) but no fleet view available; not shedding`,
        )
        return
      }
      if (stats.instanceCount <= 1) {
        this.logger.warn(
          `Hot (${hot}) but sole instance; waiting for new machine`,
        )
        return
      }

      const fleetAverage = stats.fleetTotal / stats.instanceCount
      const shareThreshold = fleetAverage * (1 + this.shareMargin)
      if (stats.myCount <= shareThreshold) {
        this.logger.warn(
          `Hot (${hot}) but balanced (mine=${stats.myCount}, fleet avg=${fleetAverage.toFixed(0)}); waiting for new machine`,
        )
        return
      }

      if (Date.now() - this.lastShedAt < this.cooldownMs) {
        return
      }

      // Shed toward the fleet average, never below the absolute floor.
      const lowerBound = Math.max(this.minConnections, Math.ceil(fleetAverage))
      const target = Math.min(this.batchSize, connections - lowerBound)
      if (target <= 0) {
        return
      }

      const closed = this.gateway.shedConnections(target, this.closeCode)
      this.lastShedAt = Date.now()
      this.shedCounter.add(closed, { reason: "rebalance" })
      this.logger.log(
        `Shed ${closed}: hot (${hot}) and over fair share (mine=${stats.myCount} > ` +
          `avg ${fleetAverage.toFixed(0)} ×${1 + this.shareMargin}), ${connections} -> ~${connections - closed}`,
      )
    } catch (err) {
      this.logger.warn(
        `Shedding evaluation failed: ${err instanceof Error ? err.message : err}`,
      )
    } finally {
      this.evaluating = false
    }
  }

  private async drain(): Promise<void> {
    if (this.evalTimer) {
      clearInterval(this.evalTimer)
      this.evalTimer = null
    }

    if (!this.enabled) {
      return
    }

    const total = this.gateway.connectionCount
    if (total === 0) {
      return
    }

    this.draining = true
    this.logger.log(`Draining ${total} connection(s) before shutdown`)

    const deadline = Date.now() + this.drainTimeoutMs
    while (this.gateway.connectionCount > 0 && Date.now() < deadline) {
      const closed = this.gateway.shedConnections(
        this.batchSize,
        this.closeCode,
      )
      this.shedCounter.add(closed, { reason: "drain" })
      await new Promise((resolve) =>
        setTimeout(resolve, this.drainBatchIntervalMs),
      )
    }

    const remaining = this.gateway.connectionCount
    if (remaining > 0) {
      this.logger.warn(
        `Drain timed out with ${remaining} connection(s) still open`,
      )
    } else {
      this.logger.log("Drain complete")
    }
  }
}
