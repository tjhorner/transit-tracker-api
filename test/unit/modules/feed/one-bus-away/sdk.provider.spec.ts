import { REQUEST } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import OnebusawaySDK from "onebusaway-sdk"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { OneBusAwayConfig } from "src/modules/feed/modules/one-bus-away/config"
import { OneBusAwayInstrumentationService } from "src/modules/feed/modules/one-bus-away/instrumentation.service"
import { oneBusAwaySdkProvider } from "src/modules/feed/modules/one-bus-away/sdk.provider"
import { mock } from "vitest-mock-extended"

describe("oneBusAwaySdkProvider", () => {
  const feedContext: FeedContext<OneBusAwayConfig> = {
    feedCode: "testfeed",
    config: {
      apiKey: "TEST_API_KEY",
      baseUrl: "https://api.example.com/api",
    },
  }

  it("creates a OnebusawaySDK instance with correct configuration", async () => {
    // Arrange
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: REQUEST, useValue: feedContext },
        oneBusAwaySdkProvider,
      ],
    }).compile()

    // Act
    const obaSdk = moduleRef.get<OnebusawaySDK>(OnebusawaySDK)

    // Assert
    expect(obaSdk).toBeInstanceOf(OnebusawaySDK)
    expect(obaSdk.apiKey).toBe("TEST_API_KEY")
    expect(obaSdk.baseURL).toBe("https://api.example.com/api")
  })

  it("creates a OnebusawaySDK instance with instrumented fetch if available", async () => {
    // Arrange
    const mockInstrumentationService = mock<OneBusAwayInstrumentationService>()
    mockInstrumentationService.fetch.mockResolvedValue(
      new Response(null, { status: 200 }),
    )

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: REQUEST, useValue: feedContext },
        {
          provide: OneBusAwayInstrumentationService,
          useValue: mockInstrumentationService,
        },
        oneBusAwaySdkProvider,
      ],
    }).compile()

    // Act
    const obaSdk = moduleRef.get<OnebusawaySDK>(OnebusawaySDK)
    await obaSdk.config.retrieve()

    // Assert
    expect(mockInstrumentationService.fetch).toHaveBeenCalledTimes(1)
  })
})
