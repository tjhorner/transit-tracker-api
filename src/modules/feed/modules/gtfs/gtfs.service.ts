import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager"
import { Inject, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { BBox } from "geojson"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import type {
  FeedContext,
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  SyncOptions,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import { GtfsConfig, GtfsConfigSchema } from "./config"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsRealtimeService } from "./gtfs-realtime.service"
import { getStopBounds } from "./queries/get-stop-bounds.queries"
import { getStop } from "./queries/get-stop.queries"
import { listRoutesForStop } from "./queries/list-routes-for-stop.queries"
import {
  getScheduleForRouteAtStop,
  IGetScheduleForRouteAtStopResult,
} from "./queries/list-schedule-for-route.queries"
import { listStopsInArea } from "./queries/list-stops-in-area.queries"
import { listStops } from "./queries/list-stops.queries"
import { GtfsSyncService } from "./sync/gtfs-sync.service"
import { getImportMetadata } from "./sync/queries/get-import-metadata.queries"

const TripScheduleRelationship = GtfsRt.TripDescriptor.ScheduleRelationship

const StopTimeScheduleRelationship =
  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship

type ITripUpdate = GtfsRt.ITripUpdate

@RegisterFeedProvider("gtfs")
export class GtfsService implements FeedProvider {
  private logger = new Logger(GtfsService.name)
  private feedCode: string
  private config: GtfsConfig

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(REQUEST) { feedCode, config }: FeedContext<GtfsConfig>,
    private readonly db: GtfsDbService,
    private readonly syncService: GtfsSyncService,
    private readonly realtimeService: GtfsRealtimeService,
  ) {
    this.logger = new Logger(`${GtfsService.name}[${feedCode}]`)
    this.feedCode = feedCode
    this.config = GtfsConfigSchema.parse(config)
  }

  private async cached<T>(
    key: string,
    fn: () => Promise<T | { value: T; ttl: number }>,
    ttl?: number,
  ): Promise<T> {
    const cacheKey = `${this.feedCode}-${key}`
    const cached = await this.cacheManager.get<T>(cacheKey)
    if (cached) {
      return cached
    }

    const result = await fn()
    if (result instanceof Object && "value" in result && "ttl" in result) {
      if (result.ttl > 0) {
        this.cacheManager.set(cacheKey, result.value, result.ttl)
      }

      return result.value
    }

    this.cacheManager.set(cacheKey, result, ttl)
    return result
  }

  async healthCheck(): Promise<void> {
    const result = await this.syncService.hasEverSynced()
    if (!result) {
      throw new Error("GTFS feed has never been synced")
    }
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cached(
      "agencyBounds",
      async () => {
        const [stopBounds] = await getStopBounds.run(undefined, this.db)

        return [
          stopBounds.min_lon,
          stopBounds.min_lat,
          stopBounds.max_lon,
          stopBounds.max_lat,
        ] as [number, number, number, number]
      },
      86_400_000,
    ) // 24 hours
  }

  async sync(opts?: SyncOptions): Promise<void> {
    await this.syncService.import(opts)
  }

  async getLastSync(): Promise<Date> {
    return new Date(
      await this.cached(
        "lastSync",
        async () => {
          const [metadata] = await getImportMetadata.run(undefined, this.db)
          return metadata.imported_at
        },
        300_000, // 5 minutes
      ),
    )
  }

  private removeFromStart(str: string, substrs: string[]): string {
    for (const substr of substrs) {
      if (str.startsWith(substr)) {
        return str.slice(substr.length).trim()
      }
    }

    return str
  }

  private removeRouteNameFromHeadsign(
    routeShortName: string | null,
    headsign: string,
  ): string {
    if (!routeShortName) {
      return headsign.trim()
    }

    if (!headsign) {
      return ""
    }

    return this.removeFromStart(headsign.trim(), [
      `${routeShortName} `,
      `${routeShortName} - `,
      `${routeShortName}: `,
    ])
  }

  async getScheduleForRouteAtStop(
    routeId: string,
    stopId: string,
    dayOffset: number,
  ): Promise<IGetScheduleForRouteAtStopResult[]> {
    const now = Date.now()

    const dateKey = new Date(now)
    dateKey.setDate(dateKey.getDate() + dayOffset)
    dateKey.setHours(12 % (dateKey.getHours() + 1), 0, 0, 0)

    const cacheKey = `schedule-${routeId}-${stopId}-${dateKey.getTime()}`
    return this.cached(
      cacheKey,
      async () => {
        const interval = `${dayOffset} days`
        const result = await getScheduleForRouteAtStop.run(
          {
            nowUnixTime: Date.now() / 1000,
            routeId,
            stopId,
            offset: interval,
          },
          this.db,
        )

        return result
      },
      43_200_000, // 12 hours
    )
  }

  async listStops(): Promise<Stop[]> {
    return this.cached(
      "stops",
      async () => {
        const stops = await listStops.run(undefined, this.db)

        return stops.map((stop) => ({
          stopId: stop.stop_id,
          stopCode: stop.stop_code,
          name: stop.stop_name ?? "Unnamed Stop",
          lat: stop.stop_lat!,
          lon: stop.stop_lon!,
        }))
      },
      86_400_000,
    )
  }

  async getStopsInArea(
    bbox: [number, number, number, number],
  ): Promise<Stop[]> {
    const stops = await listStopsInArea.run(
      {
        minLon: bbox[0],
        minLat: bbox[1],
        maxLon: bbox[2],
        maxLat: bbox[3],
      },
      this.db,
    )

    return stops.map((stop) => ({
      stopId: stop.stop_id,
      stopCode: stop.stop_code,
      name: stop.stop_name ?? "Unnamed Stop",
      lat: stop.stop_lat!,
      lon: stop.stop_lon!,
    }))
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cached(
      `stop-${stopId}`,
      async () => {
        const stop = await getStop.run({ stopId }, this.db)
        return {
          stopId: stop[0].stop_id,
          stopCode: stop[0].stop_code,
          name: stop[0].stop_name ?? "Unnamed Stop",
          lat: stop[0].stop_lat ?? 0,
          lon: stop[0].stop_lon ?? 0,
        }
      },
      86_400_000,
    )
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cached(
      `routesForStop-${stopId}`,
      async () => {
        const routes = await listRoutesForStop.run(
          {
            stopId,
          },
          this.db,
        )

        return routes.map<StopRoute>((route) => ({
          routeId: route.route_id,
          color: route.route_color?.replaceAll("#", "") ?? null,
          name:
            (!route.route_short_name || route.route_short_name.trim() === ""
              ? route.route_long_name
              : route.route_short_name) ?? "Unnamed Route",
          headsigns: (route.headsigns as string[])
            .filter((headsign) => headsign && headsign.trim() !== "")
            .map((headsign) =>
              this.removeRouteNameFromHeadsign(
                route.route_short_name,
                headsign,
              ),
            ),
        }))
      },
      86_400_000,
    )
  }

  async getTripUpdates(): Promise<ITripUpdate[]> {
    if (!this.config.rtTripUpdates) {
      return []
    }

    const allFeedEntities: GtfsRt.IFeedEntity[] = await this.cached(
      "tripUpdates",
      this.realtimeService.getTripUpdates.bind(this.realtimeService),
    )

    return allFeedEntities
      .map((entity) => entity.tripUpdate)
      .filter((tripUpdate) => !!tripUpdate)
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    const scheduleDates = [-1, 0, 1]
    const now = Date.now()

    let tripUpdates: ITripUpdate[] = []
    try {
      tripUpdates = await this.getTripUpdates()
    } catch (e: any) {
      this.logger.warn("Failed to fetch trip updates, using schedule", e.stack)
    }

    const tripStops: TripStop[] = []
    for (const scheduleDate of scheduleDates) {
      const staticTrips = (
        await Promise.all(
          routes.map(({ routeId, stopId }) =>
            this.getScheduleForRouteAtStop(routeId, stopId, scheduleDate),
          ),
        )
      ).flat()

      staticTrips.forEach((staticTrip) => {
        const { tripUpdate, stopTimeUpdate } =
          this.realtimeService.matchTripToTripUpdate(staticTrip, tripUpdates)

        const { arrivalTime, departureTime, isRealtime } =
          this.realtimeService.resolveTripTimes(staticTrip, stopTimeUpdate)

        if (departureTime.getTime() < now) {
          return
        }

        // A trip is "feasibly active" if it arrives or departs within 4 hours
        // and is used to determine if we should apply cancellations or skips
        // to the trip
        const tripIsFeasiblyActive =
          Math.min(
            Math.abs(arrivalTime.getTime() - now),
            Math.abs(departureTime.getTime() - now),
          ) < 14400000

        // Apply cancelled or skipped updates to trips that:
        //   - we infer are active *or*
        //   - explicitly have the same start date as the trip
        if (
          tripIsFeasiblyActive ||
          tripUpdate?.trip?.startDate === staticTrip.start_date
        ) {
          if (
            tripUpdate?.trip?.scheduleRelationship ===
            TripScheduleRelationship.CANCELED
          ) {
            return
          }

          if (
            stopTimeUpdate?.scheduleRelationship ===
            StopTimeScheduleRelationship.SKIPPED
          ) {
            return
          }
        }

        if (
          tripStops.some(
            (ts) =>
              ts.tripId === staticTrip.trip_id &&
              ts.arrivalTime === arrivalTime &&
              ts.departureTime === departureTime,
          )
        ) {
          // Don't add duplicate trip
          return
        }

        tripStops.push({
          tripId: staticTrip.trip_id,
          routeId: staticTrip.route_id,
          stopId: staticTrip.stop_id,
          routeName: staticTrip.route_name ?? "Unnamed Route",
          routeColor: staticTrip.route_color?.replaceAll("#", "") ?? null,
          headsign: staticTrip.stop_headsign
            ? this.removeRouteNameFromHeadsign(
                staticTrip.route_name,
                staticTrip.stop_headsign,
              )
            : "",
          stopName: staticTrip.stop_name ?? "Unnamed Stop",
          arrivalTime,
          departureTime,
          isRealtime,
        })
      })
    }

    return tripStops
  }
}
