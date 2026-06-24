import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationBootstrap,
} from "@nestjs/common"
import { Counter } from "@opentelemetry/api"
import { MetricService } from "nestjs-otel"
import { InjectPinoLogger, PinoLogger } from "nestjs-pino"
import { env } from "../env"
import { CpuMonitorService } from "./cpu-monitor.service"
import { ScheduleMetricsService } from "./schedule-metrics.service"
import { ScheduleGateway } from "./schedule.gateway"

@Injectable()
export class ConnectionSheddingService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly enabled = env.boolean("SHED_ENABLED")
  private readonly highWaterUtilization = env.float(
    "SHED_CPU_HIGH_WATER",
    0.0625,
  )
  private readonly batchSize = env.int("SHED_BATCH_SIZE", 10)
  private readonly minConnections = env.int("SHED_MIN_CONNECTIONS", 50)
  private readonly shareMargin = env.float("SHED_SHARE_MARGIN", 0.2)
  private readonly evalIntervalMs = env.duration("SHED_EVAL_INTERVAL", 10_000)
  private readonly cooldownMs = env.duration("SHED_COOLDOWN", 60_000)
  private readonly closeCode = env.int("SHED_CLOSE_CODE", 1001)
  private readonly drainBatchIntervalMs = env.duration(
    "SHED_DRAIN_BATCH_INTERVAL",
    1_000,
  )
  private readonly drainTimeoutMs = env.duration("SHED_DRAIN_TIMEOUT", 30_000)

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
    @InjectPinoLogger(ConnectionSheddingService.name)
    private readonly logger: PinoLogger,
  ) {
    this.shedCounter = metricService.getCounter("connection_shed_total", {
      description: "Connections closed by the load shedder",
      unit: "connections",
    })
  }

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.info("Connection shedding disabled (set SHED_ENABLED=true)")
      return
    }

    this.evalTimer = setInterval(
      () => void this.evaluate(),
      this.evalIntervalMs,
    )
    this.evalTimer.unref?.()
    this.logger.info(
      {
        highWaterUtilization: this.highWaterUtilization,
        shareMargin: this.shareMargin,
        batchSize: this.batchSize,
        minConnections: this.minConnections,
        cooldownMs: this.cooldownMs,
      },
      "Connection shedding enabled",
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
      const connections = this.gateway.connectionCount
      if (connections <= this.minConnections) {
        this.logger.warn(
          { utilization, connections, floor: this.minConnections },
          "Hot at connection floor; not shedding",
        )
        return
      }

      // check if connections are unbalanced
      const stats = await this.metricsService.getFleetConnectionStats()
      if (!stats) {
        this.logger.warn(
          { utilization, connections },
          "Hot but no fleet view available; not shedding",
        )
        return
      }
      if (stats.instanceCount <= 1) {
        this.logger.warn(
          { utilization, connections, instanceCount: stats.instanceCount },
          "Hot but sole instance; waiting for new machine",
        )
        return
      }

      const fleetAverage = stats.fleetTotal / stats.instanceCount
      const shareThreshold = fleetAverage * (1 + this.shareMargin)
      if (stats.myCount <= shareThreshold) {
        this.logger.warn(
          { utilization, myCount: stats.myCount, fleetAverage },
          "Hot but balanced; waiting for new machine",
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
      this.logger.info(
        {
          closed,
          utilization,
          myCount: stats.myCount,
          fleetAverage,
          shareMargin: this.shareMargin,
          connectionsBefore: connections,
          connectionsAfter: connections - closed,
        },
        "Shed connections over fair share",
      )
    } catch (err) {
      this.logger.warn({ err }, "Shedding evaluation failed")
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
    this.logger.info(
      { connections: total },
      "Draining connections before shutdown",
    )

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
        { remaining },
        "Drain timed out with connections still open",
      )
    } else {
      this.logger.info("Drain complete")
    }
  }
}
