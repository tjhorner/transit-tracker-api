import { Test } from "@nestjs/testing"
import { HafasClient } from "hafas-client"
import { FEED_CONTEXT } from "src/modules/feed/feed-context"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import {
  HAFAS_CLIENT,
  hafasClientProvider,
  withRequestTimeout,
} from "src/modules/feed/modules/hafas/client.provider"
import { HafasConfig } from "src/modules/feed/modules/hafas/config"

describe("withRequestTimeout", () => {
  it("adds an abort signal and keeps the profile's own request transform", () => {
    const profile = withRequestTimeout({
      transformReq: (_ctx: unknown, req: object) => ({ ...req, custom: true }),
    } as never)

    const req = profile.transformReq!({}, { method: "post" })

    expect(req).toMatchObject({ method: "post", custom: true })
    expect((req as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal)
  })

  it("adds an abort signal when the profile has no request transform", () => {
    const profile = withRequestTimeout({} as never)

    const req = profile.transformReq!({}, { method: "post" })

    expect((req as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal)
  })
})

describe("hafasClientProvider", () => {
  const feedContext: FeedContext<HafasConfig> = {
    feedCode: "testfeed",
    config: {
      profile: "db",
      userAgent: "transit-tracker-api-test",
    },
  }

  it("creates a HafasClient for the configured profile", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: FEED_CONTEXT, useValue: feedContext },
        hafasClientProvider,
      ],
    }).compile()

    const hafasClient = moduleRef.get<HafasClient>(HAFAS_CLIENT)

    for (const method of [
      "serverInfo",
      "arrivals",
      "departures",
      "stop",
      "nearby",
    ] as const) {
      expect(typeof hafasClient[method]).toBe("function")
    }
  })

  it("throws when the configured profile does not exist", async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          {
            provide: FEED_CONTEXT,
            useValue: {
              feedCode: "testfeed",
              config: {
                profile: "not-a-real-profile",
                userAgent: "transit-tracker-api-test",
              },
            },
          },
          hafasClientProvider,
        ],
      }).compile(),
    ).rejects.toThrow()
  })
})
