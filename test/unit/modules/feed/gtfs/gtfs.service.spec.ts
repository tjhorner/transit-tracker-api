import { Cacheable } from "cacheable"
import { PinoLogger } from "nestjs-pino"
import { DateTimeService } from "src/modules/datetime/datetime.service"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import { GtfsConfig } from "src/modules/feed/modules/gtfs/config"
import { GtfsDbService } from "src/modules/feed/modules/gtfs/gtfs-db.service"
import { GtfsMetricsService } from "src/modules/feed/modules/gtfs/gtfs-metrics.service"
import { GtfsRealtimeService } from "src/modules/feed/modules/gtfs/gtfs-realtime.service"
import { GtfsService } from "src/modules/feed/modules/gtfs/gtfs.service"
import { GtfsSyncService } from "src/modules/feed/modules/gtfs/sync/gtfs-sync.service"
import { mock, mockDeep, MockProxy } from "vitest-mock-extended"

function mockInMemoryCacheable(): MockProxy<Cacheable> {
  const entries = new Map<string, unknown>()
  const cacheManager = mock<Cacheable>()

  cacheManager.get.mockImplementation(
    async (key: string) => entries.get(key) as any,
  )
  cacheManager.set.mockImplementation(async (key: string, value: unknown) => {
    entries.set(key, value)
    return true
  })

  return cacheManager
}

describe("GtfsService", () => {
  let db: MockProxy<GtfsDbService>
  let gtfsService: GtfsService

  beforeEach(() => {
    const feedContext = {
      feedCode: "testfeed",
      config: { static: { url: "http://localhost/gtfs.zip" } } as GtfsConfig,
    }

    const dateTime = mock<DateTimeService>()
    dateTime.now.mockReturnValue(new Date("2026-11-10T20:00:00Z"))

    db = mock<GtfsDbService>()

    gtfsService = new GtfsService(
      feedContext,
      new FeedCacheService(mockInMemoryCacheable(), feedContext),
      db,
      mock<GtfsSyncService>(),
      mock<GtfsRealtimeService>(),
      mock<GtfsMetricsService>(),
      dateTime,
      mockDeep<PinoLogger>(),
    )
  })

  describe("getScheduleForRouteAtStop", () => {
    it("caches the schedule for a route-stop pair", async () => {
      db.query.mockResolvedValue({ rows: [{ trip_id: "G1" }], rowCount: 1 })

      const first = await gtfsService.getScheduleForRouteAtStop(
        "Green-B",
        "70107",
        0,
      )
      const second = await gtfsService.getScheduleForRouteAtStop(
        "Green-B",
        "70107",
        0,
      )

      expect(db.query).toHaveBeenCalledOnce()
      expect(second).toEqual(first)
    })

    it("does not share a cached schedule between pairs whose IDs join to the same string", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ trip_id: "G1" }], rowCount: 1 })

      const scheduleForUnknownPair =
        await gtfsService.getScheduleForRouteAtStop("Green", "B-70107", 0)
      const scheduleForRealPair = await gtfsService.getScheduleForRouteAtStop(
        "Green-B",
        "70107",
        0,
      )

      expect(scheduleForUnknownPair).toEqual([])
      expect(scheduleForRealPair).toEqual([{ trip_id: "G1" }])
    })
  })
})
