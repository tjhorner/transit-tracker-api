import { MetricService } from "nestjs-otel"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import { OneBusAwayConfig } from "src/modules/feed/modules/one-bus-away/config"
import { OneBusAwayService } from "src/modules/feed/modules/one-bus-away/one-bus-away.service"
import { mock, MockProxy } from "vitest-mock-extended"
import { createFakeOneBusAwayServer } from "./fake-oba-server"

const feedContext: FeedContext<OneBusAwayConfig> = {
  feedCode: "test-feed",
  config: {
    baseUrl: "https://api.example.com",
    apiKey: "testApiKey",
  },
}

describe("OneBusAwayService", () => {
  const fakeOba = createFakeOneBusAwayServer(
    feedContext.config.baseUrl,
    feedContext.config.apiKey,
  )

  beforeAll(() => {
    fakeOba.server.listen({ onUnhandledRequest: "error" })
  })

  afterAll(() => {
    fakeOba.server.close()
  })

  afterEach(() => {
    fakeOba.server.resetHandlers()
    fakeOba.server.events.removeAllListeners()
  })

  let oneBusAwayService: OneBusAwayService
  let mockCacheService: MockProxy<FeedCacheService>
  let metricService: MetricService

  beforeEach(() => {
    mockCacheService = mock<FeedCacheService>()
    metricService = new MetricService()

    mockCacheService.cached.mockImplementation((key, fn) => fn())

    oneBusAwayService = new OneBusAwayService(
      feedContext,
      mockCacheService,
      metricService,
    )
  })

  it("performs a health check successfully", async () => {
    await oneBusAwayService.healthCheck()
  })

  it("retrieves feed metadata using config endpoint", async () => {
    const metadata = await oneBusAwayService.getMetadata()

    expect(metadata.oneBusAwayServer).toBe(feedContext.config.baseUrl)
    expect(metadata.bundleId).toBe("9c1476ec-749c-4dcf-b541-fcfe0e113b4d")
    expect(metadata.bundleName).toBe("MAY25_4_1")
    expect(metadata.serviceDateFrom.getTime()).toBe(1747983600000)
    expect(metadata.serviceDateTo.getTime()).toBe(1753254000000)
  })

  it("uses the combined bounding box of all agencies for agency bounds", async () => {
    const bounds = await oneBusAwayService.getAgencyBounds()

    expect(bounds[0]).toBe(-122.64002299999999)
    expect(bounds[1]).toBe(47.090011)
    expect(bounds[2]).toBe(-121.709991)
    expect(bounds[3]).toBe(47.979318)
  })
})
