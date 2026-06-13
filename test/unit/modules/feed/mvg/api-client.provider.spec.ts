import { Test } from "@nestjs/testing"
import { FEED_CONTEXT } from "src/modules/feed/feed-context"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { MvgApiClient } from "src/modules/feed/modules/mvg/api-client"
import { mvgApiClientProvider } from "src/modules/feed/modules/mvg/api-client.provider"
import { MvgConfig } from "src/modules/feed/modules/mvg/config"

describe("mvgApiClientProvider", () => {
  const feedContext: FeedContext<MvgConfig> = {
    feedCode: "testfeed",
    config: {
      baseUrl: "https://mvg.example.com/api",
    },
  }

  it("creates an MvgApiClient bound to the configured base URL", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: FEED_CONTEXT, useValue: feedContext },
        mvgApiClientProvider,
      ],
    }).compile()

    const apiClient = moduleRef.get(MvgApiClient)

    expect(apiClient).toBeInstanceOf(MvgApiClient)
    expect(apiClient.baseUrl).toBe("https://mvg.example.com/api")
  })
})
