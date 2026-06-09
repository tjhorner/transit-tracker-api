import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common"
import { MetricService } from "nestjs-otel"
import { availableParallelism, cpus } from "os"
import { env } from "../env"

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
  private lastSampleAt = performance.now()
  private timer: ReturnType<typeof setInterval> | null = null

  private readonly sampleIntervalMs = env.duration(
    "SHED_CPU_SAMPLE_INTERVAL",
    5_000,
  )
  private readonly windowMs = env.duration("SHED_CPU_WINDOW", 60_000)

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
    this.lastSampleAt = performance.now()
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs)
    this.timer.unref?.()
    this.logger.log(
      `CPU monitor started: ${this.vcpuCount} vCPU, ${this.sampleIntervalMs}ms sample, ${this.windowMs}ms window`,
    )
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  private sample() {
    const now = performance.now()
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

    const cutoff = now - this.windowMs
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
    return this.samples.length * this.sampleIntervalMs >= this.windowMs * 0.8
  }
}
