import {
  DefaultBodyType,
  http,
  HttpResponse,
  HttpResponseResolver,
  JsonBodyType,
  PathParams,
} from "msw"
import { setupServer } from "msw/node"
import { MetricService } from "nestjs-otel"
import { mock, MockProxy } from "vitest-mock-extended"
import { FeedContext } from "../../interfaces/feed-provider.interface"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import { OneBusAwayConfig } from "./config"
import { OneBusAwayService } from "./one-bus-away.service"

const feedContext: FeedContext<OneBusAwayConfig> = {
  feedCode: "test-feed",
  config: {
    baseUrl: "https://api.example.com",
    apiKey: "testApiKey",
  },
}

const withMockAuth = (
  resolver: HttpResponseResolver<PathParams, DefaultBodyType, JsonBodyType>,
) => {
  return (input) => {
    const url = new URL(input.request.url)
    if (url.searchParams.get("key") !== feedContext.config.apiKey) {
      return HttpResponse.json(
        {
          code: 401,
          currentTime: Date.now(),
          text: "permission denied",
          version: 1,
        },
        { status: 401 },
      )
    }

    return resolver(input)
  }
}

const mockServerHandlers = [
  http.get(
    `${feedContext.config.baseUrl}/api/where/current-time.json`,
    withMockAuth(() => {
      const now = new Date()
      return HttpResponse.json({
        code: 200,
        currentTime: now.getTime(),
        data: {
          entry: {
            readableTime: now.toISOString(),
            time: now.getTime(),
          },
          references: {
            agencies: [],
            routes: [],
            situations: [],
            stopTimes: [],
            stops: [],
            trips: [],
          },
        },
        text: "OK",
        version: 2,
      })
    }),
  ),
  http.get(
    `${feedContext.config.baseUrl}/api/where/config.json`,
    withMockAuth(() => {
      return HttpResponse.json({
        code: 200,
        currentTime: Date.now(),
        data: {
          entry: {
            gitProperties: {
              "git.branch": "0fe09c8000a986ec3be91f141db7936659cee472",
              "git.build.host": "swdev31",
              "git.build.time": "07.05.2024 @ 11:19:45 EDT",
              "git.build.user.email": "sheldonb@gmail.com",
              "git.build.user.name": "sheldonabrown",
              "git.build.version": "2.5.12-cs",
              "git.closest.tag.commit.count": "0",
              "git.closest.tag.name":
                "onebusaway-application-modules-2.5.12-cs",
              "git.commit.id": "0fe09c8000a986ec3be91f141db7936659cee472",
              "git.commit.id.abbrev": "0fe09c8",
              "git.commit.id.describe":
                "onebusaway-application-modules-2.5.12-cs",
              "git.commit.id.describe-short":
                "onebusaway-application-modules-2.5.12-cs",
              "git.commit.message.full":
                "[maven-release-plugin] prepare release onebusaway-application-modules-2.5.12-cs",
              "git.commit.message.short":
                "[maven-release-plugin] prepare release onebusaway-application-modules-2.5.12-cs",
              "git.commit.time": "03.05.2024 @ 14:56:39 EDT",
              "git.commit.user.email": "caysavitzky@gmail.com",
              "git.commit.user.name": "CaylaSavitzky",
              "git.dirty": "true",
              "git.remote.origin.url":
                "git@github.com:camsys/onebusaway-application-modules",
              "git.tags": "onebusaway-application-modules-2.5.12-cs",
            },
            id: "9c1476ec-749c-4dcf-b541-fcfe0e113b4d",
            name: "MAY25_4_1",
            serviceDateFrom: "1747983600000",
            serviceDateTo: "1753254000000",
          },
          references: {
            agencies: [],
            routes: [],
            situations: [],
            stopTimes: [],
            stops: [],
            trips: [],
          },
        },
        text: "OK",
        version: 2,
      })
    }),
  ),
  http.get(
    `${feedContext.config.baseUrl}/api/where/agencies-with-coverage.json`,
    withMockAuth(() => {
      return HttpResponse.json({
        code: 200,
        currentTime: Date.now(),
        data: {
          limitExceeded: false,
          list: [
            {
              agencyId: "1",
              lat: 47.53009,
              latSpan: 0.6819459999999964,
              lon: -122.1083065,
              lonSpan: 0.7966309999999908,
            },
            {
              agencyId: "40",
              lat: 47.5346645,
              latSpan: 0.8893070000000023,
              lon: -122.32945649999999,
              lonSpan: 0.6211330000000004,
            },
          ],
          references: {
            agencies: [
              {
                disclaimer: "",
                email: "",
                fareUrl:
                  "https://kingcounty.gov/en/dept/metro/fares-and-payment/prices",
                id: "1",
                lang: "EN",
                name: "Metro Transit",
                phone: "206-553-3000",
                privateService: false,
                timezone: "America/Los_Angeles",
                url: "https://kingcounty.gov/en/dept/metro",
              },
              {
                disclaimer: "",
                email: "main@soundtransit.org",
                fareUrl:
                  "https://www.soundtransit.org/ride-with-us/how-to-pay/fares",
                id: "40",
                lang: "en",
                name: "Sound Transit",
                phone: "1-888-889-6368",
                privateService: false,
                timezone: "America/Los_Angeles",
                url: "https://www.soundtransit.org",
              },
            ],
            routes: [],
            situations: [],
            stopTimes: [],
            stops: [],
            trips: [],
          },
        },
        text: "OK",
        version: 2,
      })
    }),
  ),
]

describe("OneBusAwayService", () => {
  const mockServer = setupServer(...mockServerHandlers)

  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" })
  })

  afterAll(() => {
    mockServer.close()
  })

  afterEach(() => {
    mockServer.resetHandlers()
    mockServer.events.removeAllListeners()
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
