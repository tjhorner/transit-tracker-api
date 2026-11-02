import { Counter, Histogram } from "@opentelemetry/api"
import { MetricService } from "nestjs-otel"
import { OneBusAwayConfigSchema } from "src/modules/feed/modules/one-bus-away/config"
import { OneBusAwayInstrumentationService } from "src/modules/feed/modules/one-bus-away/instrumentation.service"
import { mock } from "vitest-mock-extended"

describe("OneBusAwayInstrumentationService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      baseUrl: "https://api.example.com",
      url: "https://api.example.com/api/where/current-time.json",
      expectedMethod: "current-time",
    },
    {
      baseUrl: "https://api.example.com/",
      url: "https://api.example.com/api/where/current-time.json",
      expectedMethod: "current-time",
    },
    {
      baseUrl: "https://realtime.sdmts.com/api",
      url: "https://realtime.sdmts.com/api/api/where/arrivals-and-departures-for-stop/MTS_1.json?version=2",
      expectedMethod: "arrivals-and-departures-for-stop",
    },
    {
      baseUrl: "https://example.com/transit/oba/",
      url: "https://example.com/transit/oba/api/where/current-time.json",
      expectedMethod: "current-time",
    },
  ])(
    "reports method $expectedMethod for base URL $baseUrl",
    async ({ baseUrl, url, expectedMethod }) => {
      // Arrange
      const requestCounter = mock<Counter>()
      const metricService = mock<MetricService>()
      metricService.getCounter.mockReturnValue(requestCounter)
      metricService.getHistogram.mockReturnValue(mock<Histogram>())

      const instrumentationService = new OneBusAwayInstrumentationService(
        {
          feedCode: "testfeed",
          config: OneBusAwayConfigSchema.parse({
            apiKey: "TEST_API_KEY",
            baseUrl,
            rateLimiter: { enabled: false },
          }),
        },
        metricService,
      )

      // Act
      await instrumentationService.fetch(url)

      // Assert
      expect(requestCounter.add).toHaveBeenCalledWith(1, {
        feed_code: "testfeed",
        method: expectedMethod,
      })
    },
  )
})
