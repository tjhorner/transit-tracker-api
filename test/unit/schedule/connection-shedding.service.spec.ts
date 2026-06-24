import { MetricService } from "nestjs-otel"
import { PinoLogger } from "nestjs-pino"
import { ConnectionSheddingService } from "src/schedule/connection-shedding.service"
import { CpuMonitorService } from "src/schedule/cpu-monitor.service"
import { ScheduleMetricsService } from "src/schedule/schedule-metrics.service"
import { ScheduleGateway } from "src/schedule/schedule.gateway"
import { vi } from "vitest"

const EVAL_TICK_MS = 10_000 // SHED_EVAL_INTERVAL default; one eval per tick

const ENV_KEYS = ["SHED_ENABLED", "SHED_DRAIN_TIMEOUT"]

describe("ConnectionSheddingService", () => {
  // hot + over fair share + past cooldown by default; each test relaxes one thing
  let cpuMonitor: { windowReady: boolean; averageUtilization: number }
  let gateway: {
    connectionCount: number
    shedConnections: ReturnType<typeof vi.fn>
  }
  let metricsService: { getFleetConnectionStats: ReturnType<typeof vi.fn> }
  let counterAdd: ReturnType<typeof vi.fn>
  let metricService: { getCounter: () => { add: ReturnType<typeof vi.fn> } }

  function build(): ConnectionSheddingService {
    return new ConnectionSheddingService(
      cpuMonitor as unknown as CpuMonitorService,
      gateway as unknown as ScheduleGateway,
      metricsService as unknown as ScheduleMetricsService,
      metricService as unknown as MetricService,
      {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        error: vi.fn(),
      } as unknown as PinoLogger,
    )
  }

  function startEnabled(): ConnectionSheddingService {
    process.env.SHED_ENABLED = "true"
    vi.useFakeTimers()
    const service = build()
    service.onApplicationBootstrap()
    return service
  }

  beforeEach(() => {
    counterAdd = vi.fn()
    metricService = { getCounter: () => ({ add: counterAdd }) }
    cpuMonitor = { windowReady: true, averageUtilization: 0.1 } // > 6.25% default
    gateway = {
      connectionCount: 200,
      shedConnections: vi.fn((target: number) => target),
    }
    metricsService = {
      getFleetConnectionStats: vi
        .fn()
        .mockResolvedValue({ instanceCount: 2, fleetTotal: 262, myCount: 200 }),
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key]
    }
    vi.useRealTimers()
  })

  describe("evaluate (driven by the eval timer)", () => {
    it("does not shed or query the fleet when CPU is under the high-water mark", async () => {
      // Arrange
      cpuMonitor.averageUtilization = 0.05
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(metricsService.getFleetConnectionStats).not.toHaveBeenCalled()
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed before the CPU window has filled", async () => {
      // Arrange
      cpuMonitor.windowReady = false
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed when hot but already at the connection floor", async () => {
      // Arrange
      gateway.connectionCount = 50
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(metricsService.getFleetConnectionStats).not.toHaveBeenCalled()
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed when the fleet view is unavailable", async () => {
      // Arrange
      metricsService.getFleetConnectionStats.mockResolvedValue(null)
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed when it is the sole instance", async () => {
      // Arrange
      metricsService.getFleetConnectionStats.mockResolvedValue({
        instanceCount: 1,
        fleetTotal: 200,
        myCount: 200,
      })
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed when hot but holding only its fair share (no hot potato)", async () => {
      // Arrange
      gateway.connectionCount = 131
      metricsService.getFleetConnectionStats.mockResolvedValue({
        instanceCount: 2,
        fleetTotal: 262,
        myCount: 131, // <= avg(131) * 1.2
      })
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("does not shed again while within the cooldown", async () => {
      // Arrange
      startEnabled()

      // Act: two ticks; the second lands inside the 60s cooldown
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).toHaveBeenCalledTimes(1)
    })

    it("sheds a batch toward the fleet average when hot and over its share", async () => {
      // Arrange
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      // avg = 131, lowerBound = max(50, 131) = 131, target = min(10, 200-131) = 10
      expect(gateway.shedConnections).toHaveBeenCalledWith(10, 1001)
      expect(counterAdd).toHaveBeenCalledWith(10, { reason: "rebalance" })
    })

    it("sheds only down to the lower bound when the imbalance is smaller than a batch", async () => {
      // Arrange
      gateway.connectionCount = 55
      metricsService.getFleetConnectionStats.mockResolvedValue({
        instanceCount: 2,
        fleetTotal: 80,
        myCount: 55, // > avg(40) * 1.2 = 48
      })
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      // lowerBound = max(50, 40) = 50, target = min(10, 55-50) = 5
      expect(gateway.shedConnections).toHaveBeenCalledWith(5, 1001)
    })

    it("does not shed when live connections are already below the fleet average", async () => {
      // Arrange
      gateway.connectionCount = 120
      metricsService.getFleetConnectionStats.mockResolvedValue({
        instanceCount: 2,
        fleetTotal: 262,
        myCount: 200, // over share by subscription count...
      })
      startEnabled()

      // Act
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      // ...but live sockets (120) are below lowerBound (131), so target <= 0
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("swallows fleet-view errors without shedding or crashing the loop", async () => {
      // Arrange
      metricsService.getFleetConnectionStats.mockRejectedValue(
        new Error("redis down"),
      )
      startEnabled()

      // Act: a second tick still fires, proving the loop survived the error
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)
      await vi.advanceTimersByTimeAsync(EVAL_TICK_MS)

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
      expect(metricsService.getFleetConnectionStats).toHaveBeenCalledTimes(2)
    })
  })

  describe("drain (on shutdown)", () => {
    it("closes connections in batches until none remain", async () => {
      // Arrange
      process.env.SHED_ENABLED = "true"
      let remaining = 30
      gateway = {
        shedConnections: vi.fn((target: number) => {
          const closed = Math.min(target, remaining)
          remaining -= closed
          return closed
        }),
        get connectionCount() {
          return remaining
        },
      } as any
      vi.useFakeTimers()
      const service = build()

      // Act
      const drained = service.beforeApplicationShutdown()
      await vi.advanceTimersByTimeAsync(5_000)
      await drained

      // Assert
      expect(remaining).toBe(0)
    })

    it("stops at the drain timeout if connections never drop", async () => {
      // Arrange
      process.env.SHED_ENABLED = "true"
      process.env.SHED_DRAIN_TIMEOUT = "3s"
      gateway = {
        connectionCount: 30,
        shedConnections: vi.fn(() => 0), // nothing ever closes
      }
      vi.useFakeTimers()
      const service = build()

      // Act
      const drained = service.beforeApplicationShutdown()
      await vi.advanceTimersByTimeAsync(4_000)
      await drained

      // Assert
      expect(gateway.shedConnections).toHaveBeenCalled()
      expect(gateway.connectionCount).toBe(30)
    })

    it("is a no-op when shedding is disabled", async () => {
      // Arrange
      gateway.connectionCount = 30
      const service = build()

      // Act
      await service.beforeApplicationShutdown()

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })

    it("is a no-op when there are no connections", async () => {
      // Arrange
      process.env.SHED_ENABLED = "true"
      gateway.connectionCount = 0
      const service = build()

      // Act
      await service.beforeApplicationShutdown()

      // Assert
      expect(gateway.shedConnections).not.toHaveBeenCalled()
    })
  })
})
