import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common"
import { MetricService } from "nestjs-otel"
import { availableParallelism, cpus } from "os"

const SAMPLE_INTERVAL_MS = Number(
  process.env.SHED_CPU_SAMPLE_INTERVAL_MS ?? 5_000,
)
const WINDOW_MS = Number(process.env.SHED_CPU_WINDOW_MS ?? 60_000)

interface UtilizationSample {
  at: number
  utilization: number
}

@Injectable()
export class CpuMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CpuMonitorService.name)
  private readonly vcpuCount =
    (typeof availableParallelism === "function"
      ? availableParallelism()
      : cpus().length) || 1
  private readonly samples: UtilizationSample[] = []
  private lastCpuUsage = process.cpuUsage()
  private lastSampleAt = Date.now()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(metricService: MetricService) {
    metricService
      .getObservableGauge("process_cpu_utilization", {
        description:
          "Moving-average process CPU utilization as a fraction of the machine's vCPUs",
        unit: "1",
      })
      .addCallback((observable) => observable.observe(this.averageUtilization))
  }

  onApplicationBootstrap() {
    this.lastCpuUsage = process.cpuUsage()
    this.lastSampleAt = Date.now()
    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    this.timer.unref?.()
    this.logger.log(
      `CPU monitor started: ${this.vcpuCount} vCPU, ${SAMPLE_INTERVAL_MS}ms sample, ${WINDOW_MS}ms window`,
    )
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  private sample() {
    const now = Date.now()
    const current = process.cpuUsage()
    const elapsedMs = now - this.lastSampleAt
    if (elapsedMs <= 0) {
      return
    }

    const cpuMicros =
      current.user -
      this.lastCpuUsage.user +
      (current.system - this.lastCpuUsage.system)
    this.lastCpuUsage = current
    this.lastSampleAt = now

    const utilization = cpuMicros / 1000 / (elapsedMs * this.vcpuCount)
    this.samples.push({ at: now, utilization })

    const cutoff = now - WINDOW_MS
    while (this.samples.length > 0 && this.samples[0].at < cutoff) {
      this.samples.shift()
    }
  }

  get averageUtilization(): number {
    if (this.samples.length === 0) {
      return 0
    }
    const sum = this.samples.reduce((acc, s) => acc + s.utilization, 0)
    return sum / this.samples.length
  }

  get windowReady(): boolean {
    return this.samples.length * SAMPLE_INTERVAL_MS >= WINDOW_MS * 0.8
  }
}
