import {
  DefaultBodyType,
  HttpResponse,
  HttpResponseResolver,
  JsonBodyType,
  PathParams,
  http,
} from "msw"
import { setupServer } from "msw/node"

export function createFakeOneBusAwayServer(baseUrl: string, apiKey: string) {
  const withMockAuth = (
    resolver: HttpResponseResolver<PathParams, DefaultBodyType, JsonBodyType>,
  ) => {
    return (input) => {
      const url = new URL(input.request.url)
      if (url.searchParams.get("key") !== apiKey) {
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
      `${baseUrl}/api/where/current-time.json`,
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
      `${baseUrl}/api/where/config.json`,
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
      `${baseUrl}/api/where/agencies-with-coverage.json`,
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

  const server = setupServer(...mockServerHandlers)

  return {
    server,
  }
}
