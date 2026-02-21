import { Inject, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { BBox } from "geojson"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import ms from "ms"
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
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import { type GtfsConfig } from "./config"
import { GTFS_CONFIG } from "./const"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsMetricsService } from "./gtfs-metrics.service"
import { GtfsRealtimeService } from "./gtfs-realtime.service"
import { getFeedInfo } from "./queries/get-feed-info.queries"
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

  constructor(
    @Inject(REQUEST) { feedCode }: FeedContext<GtfsConfig>,
    @Inject(GTFS_CONFIG) private readonly config: GtfsConfig,
    private readonly cache: FeedCacheService,
    private readonly db: GtfsDbService,
    private readonly syncService: GtfsSyncService,
    private readonly realtimeService: GtfsRealtimeService,
    private readonly metricsService: GtfsMetricsService,
  ) {
    this.feedCode = feedCode
    this.logger = new Logger(`${GtfsService.name}[${feedCode}]`)
    this.metricsService.activate()
  }

  async healthCheck(): Promise<void> {
    const result = await this.syncService.hasEverSynced()
    if (!result) {
      throw new Error("GTFS feed has never been synced")
    }
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cache.cached(
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
      ms("24h"),
    )
  }

  async sync(opts?: SyncOptions): Promise<void> {
    await this.syncService.import(opts)
  }

  async getLastSync(): Promise<Date> {
    return new Date(
      await this.cache.cached(
        "lastSync",
        async () => {
          const [metadata] = await getImportMetadata.run(
            {
              feedCode: this.feedCode,
            },
            this.db,
          )
          return metadata.imported_at
        },
        ms("5m"),
      ),
    )
  }

  async getMetadata(): Promise<Record<string, any>> {
    return this.cache.cached(
      "feedInfo",
      async () => {
        const [metadata] = await getFeedInfo.run(undefined, this.db)

        return {
          feedPublisherName: metadata?.feed_publisher_name,
          feedPublisherUrl: metadata?.feed_publisher_url,
          feedLang: metadata?.feed_lang,
          feedStartDate: metadata?.feed_start_date,
          feedEndDate: metadata?.feed_end_date,
          feedVersion: metadata?.feed_version,
          supportsGtfsRealtime: !!this.config.rtTripUpdates,
        }
      },
      ms("5m"),
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
    return this.cache.cached(
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
      ms("12h"),
    )
  }

  async listStops(): Promise<Stop[]> {
    return this.cache.cached(
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
      ms("24h"),
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
    return this.cache.cached(
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
      ms("24h"),
    )
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cache.cached(
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
      ms("24h"),
    )
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    const scheduleDates = [-1, 0, 1]
    const now = Date.now()

    const uniqueRouteIds = Array.from(new Set(routes.map((r) => r.routeId)))

    let tripUpdates: ITripUpdate[] = []
    try {
      tripUpdates = await this.realtimeService.getTripUpdates(uniqueRouteIds)
    } catch (e: any) {
      this.logger.warn(
        `Failed to fetch trip updates; using schedule: ${e.message}\n${e.stack}`,
      )
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
        const { tripUpdate, stopTimeUpdate, vehicle } =
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
          ) < ms("4h")

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
          vehicle: isRealtime ? vehicle : null,
          isRealtime,
        })
      })
    }

    return tripStops
  }
}
