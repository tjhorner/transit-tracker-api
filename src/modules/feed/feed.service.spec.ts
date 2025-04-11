import { Inject, Module } from "@nestjs/common"
import { DiscoveryModule, REQUEST } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { BBox } from "geojson"
import * as yaml from "js-yaml"
import { RegisterFeedProvider } from "./decorators/feed-provider.decorator"
import { FeedService } from "./feed.service"
import type { FeedContext } from "./interfaces/feed-provider.interface"

describe("FeedService", () => {
  let feedService: FeedService
  let firstProvider: FakeFeedProvider
  let secondProvider: FakeFeedProvider2

  beforeAll(() => {
    process.env.FEEDS_CONFIG = yaml.dump({
      feeds: {
        first: {
          name: "Fake",
          description: "A fake feed",
          fake: {
            configOption: "value",
          },
        },
        second: {
          name: "Fake 2",
          description: "A fake feed 2",
          fake_two: {
            configOption: "value2",
          },
        },
      },
    })
  })

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFeedModule, DiscoveryModule],
      providers: [FeedService],
    }).compile()

    await moduleRef.init()

    feedService = moduleRef.get<FeedService>(FeedService)

    firstProvider = feedService.getFeedProvider("first") as any

    secondProvider = feedService.getFeedProvider("second") as any
  })

  it("should create feed providers correctly", () => {
    expect(firstProvider).toBeDefined()
    expect(secondProvider).toBeDefined()
  })

  it("should create one provider per defined feed", () => {
    expect(firstProvider).not.toBe(secondProvider)
  })

  it("should pass the correct context to each provider", () => {
    expect(firstProvider.context).toBeDefined()
    expect(secondProvider.context).toBeDefined()
    expect(firstProvider.context).not.toBe(secondProvider.context)

    expect(firstProvider.context.feedCode).toBe("first")
    expect(secondProvider.context.feedCode).toBe("second")

    expect(firstProvider.context.config.configOption).toBe("value")
    expect(secondProvider.context.config.configOption).toBe("value2")
  })

  it("should instantiate the correct type of provider", () => {
    expect(firstProvider).toBeInstanceOf(FakeFeedProvider)
    expect(secondProvider).toBeInstanceOf(FakeFeedProvider2)
  })

  describe("getAllFeeds", () => {
    it("should return all feeds", () => {
      const feeds = feedService.getAllFeeds()
      expect(feeds).toEqual({
        first: {
          name: "Fake",
          description: "A fake feed",
          fake: {
            configOption: "value",
          },
        },
        second: {
          name: "Fake 2",
          description: "A fake feed 2",
          fake_two: {
            configOption: "value2",
          },
        },
      })
    })
  })

  describe("getAllFeedProviders", () => {
    it("should return all feed providers", () => {
      const providers = feedService.getAllFeedProviders()
      expect(providers).toEqual({
        first: firstProvider,
        second: secondProvider,
      })
    })
  })

  describe("getFeedProvider", () => {
    it("should return the correct provider", () => {
      const provider = feedService.getFeedProvider("first")
      expect(provider).toBe(firstProvider)
    })

    it("should return undefined if it is not registered", () => {
      const provider = feedService.getFeedProvider("nonexistent")
      expect(provider).toBeUndefined()
    })
  })

  describe("getFeedProvidersOfType", () => {
    it("should return the correct providers", () => {
      const providers = feedService.getFeedProvidersOfType(
        FakeFeedProvider as any,
      )
      expect(providers).toEqual([firstProvider])
    })

    it("should return an empty array if no providers are found", () => {
      const providers = feedService.getFeedProvidersOfType(
        class NonExistentProvider {} as any,
      )
      expect(providers).toEqual([])
    })
  })

  describe("getFeedProvidersInBounds", () => {
    it("should return providers whose agency bounds intersect with the given bounds", async () => {
      const withinFirstBounds: BBox = [
        -122.23593759639155, 47.81072529073603, -122.20140499521945,
        47.839019024429376,
      ]

      const providersWithinFirstBounds =
        await feedService.getFeedProvidersInBounds(withinFirstBounds)
      expect(providersWithinFirstBounds).toHaveLength(1)
      expect(providersWithinFirstBounds[0].feedCode).toEqual("first")

      const withinBothBounds: BBox = [
        -122.3266587983685, 47.80443569961645, -122.29271150592635,
        47.82369516703511,
      ]

      const providersWithinBothBounds =
        await feedService.getFeedProvidersInBounds(withinBothBounds)
      expect(providersWithinBothBounds).toHaveLength(2)
      expect(providersWithinBothBounds[0].feedCode).toEqual("first")
      expect(providersWithinBothBounds[1].feedCode).toEqual("second")

      const withinNoBounds: BBox = [
        -122.25759361719284, 47.885748475253195, -122.17857836754291,
        47.94184663335213,
      ]

      const providersWithinNoBounds =
        await feedService.getFeedProvidersInBounds(withinNoBounds)
      expect(providersWithinNoBounds).toHaveLength(0)
    })
  })
})

@RegisterFeedProvider("fake")
class FakeFeedProvider {
  constructor(@Inject(REQUEST) public readonly context: FeedContext<any>) {}

  getAgencyBounds(): Promise<BBox> {
    return Promise.resolve([
      -122.32138536862664, 47.798133080372395, -122.09449973698172,
      47.851117942358,
    ])
  }
}

@RegisterFeedProvider("fake_two")
class FakeFeedProvider2 {
  constructor(@Inject(REQUEST) public readonly context: FeedContext<any>) {}

  getAgencyBounds(): Promise<BBox> {
    return Promise.resolve([
      -122.36446278189774, 47.735488466695585, -122.27983500953374,
      47.81953087708837,
    ])
  }
}

@Module({
  providers: [FakeFeedProvider, FakeFeedProvider2],
  exports: [FakeFeedProvider, FakeFeedProvider2],
})
class FakeFeedModule {}
