import { Cacheable } from "cacheable"
import ms from "ms"
import {
  cacheKeyFromParts,
  FeedCacheService,
} from "src/modules/feed/modules/feed-cache/feed-cache.service"
import { mock, MockProxy } from "vitest-mock-extended"

describe("cacheKeyFromParts", () => {
  it("returns the same key for the same parts", () => {
    expect(cacheKeyFromParts("schedule", "Green-B", "70107", 1)).toBe(
      cacheKeyFromParts("schedule", "Green-B", "70107", 1),
    )
  })

  it.each([
    [
      ["schedule", "Green-B", "70107"],
      ["schedule", "Green", "B-70107"],
    ],
    [
      ["schedule", 'a","b', "c"],
      ["schedule", "a", 'b","c'],
    ],
    [
      ["schedule", "a", "1"],
      ["schedule", "a", 1],
    ],
  ])("returns different keys for %j and %j", (firstParts, secondParts) => {
    expect(cacheKeyFromParts(...firstParts)).not.toBe(
      cacheKeyFromParts(...secondParts),
    )
  })
})

describe("FeedCacheService", () => {
  let cacheManager: MockProxy<Cacheable>
  let feedCache: FeedCacheService

  beforeEach(() => {
    cacheManager = mock<Cacheable>()
    cacheManager.get.mockResolvedValue(undefined)
    feedCache = new FeedCacheService(cacheManager, {
      feedCode: "testfeed",
      config: {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("concurrent lookups", () => {
    it("runs the lookup once for concurrent calls with the same key", async () => {
      const lookup = vi.fn().mockResolvedValue("value")

      const results = await Promise.all(
        Array.from({ length: 10 }, () => feedCache.cached("key", lookup)),
      )

      expect(lookup).toHaveBeenCalledOnce()
      expect(results).toEqual(Array(10).fill("value"))
    })

    it("runs separate lookups for different keys", async () => {
      const lookup = vi.fn().mockResolvedValue("value")

      await Promise.all([
        feedCache.cached("first", lookup),
        feedCache.cached("second", lookup),
      ])

      expect(lookup).toHaveBeenCalledTimes(2)
    })

    it("looks up again once the previous lookup has finished", async () => {
      const lookup = vi.fn().mockResolvedValue("value")

      await feedCache.cached("key", lookup)
      await feedCache.cached("key", lookup)

      expect(lookup).toHaveBeenCalledTimes(2)
    })

    it("rejects all concurrent callers and retries after a failed lookup", async () => {
      const lookup = vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValue("value")

      const results = await Promise.allSettled([
        feedCache.cached("key", lookup),
        feedCache.cached("key", lookup),
      ])

      expect(results.map(({ status }) => status)).toEqual([
        "rejected",
        "rejected",
      ])
      expect(lookup).toHaveBeenCalledOnce()
      await expect(feedCache.cached("key", lookup)).resolves.toBe("value")
    })
  })

  describe("expiry jitter", () => {
    it.each([
      ["lowest", 0, ms("21.6h")],
      ["highest", 1, ms("26.4h")],
    ])(
      "applies the %s jitter to long TTLs",
      async (_name, randomValue, expectedTtl) => {
        vi.spyOn(Math, "random").mockReturnValue(randomValue)

        await feedCache.cached("key", async () => "value", ms("24h"))

        expect(cacheManager.set).toHaveBeenCalledWith(
          "testfeed-key",
          "value",
          expectedTtl,
        )
      },
    )

    it("applies jitter to TTLs returned by the lookup", async () => {
      vi.spyOn(Math, "random").mockReturnValue(1)

      await feedCache.cached("key", async () => ({
        value: "value",
        ttl: ms("2h"),
      }))

      expect(cacheManager.set).toHaveBeenCalledWith(
        "testfeed-key",
        "value",
        7_920_000,
      )
    })

    it("leaves short TTLs unchanged", async () => {
      vi.spyOn(Math, "random").mockReturnValue(1)

      await feedCache.cached("key", async () => ({
        value: "value",
        ttl: ms("30s"),
      }))

      expect(cacheManager.set).toHaveBeenCalledWith(
        "testfeed-key",
        "value",
        ms("30s"),
      )
    })

    it("leaves a missing TTL unset", async () => {
      await feedCache.cached("key", async () => "value")

      expect(cacheManager.set).toHaveBeenCalledWith(
        "testfeed-key",
        "value",
        undefined,
      )
    })
  })
})
