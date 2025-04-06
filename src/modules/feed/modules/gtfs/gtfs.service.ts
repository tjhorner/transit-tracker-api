import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager"
import { Inject, Logger } from "@nestjs/common"
import axios from "axios"
import { Kysely, sql, Transaction } from "kysely"
import { InjectKysely } from "nestjs-kysely"
import { DB } from "./db"
import {
  RouteAtStop,
  FeedProvider,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import GtfsRealtimeBindings from "gtfs-realtime-bindings"
import { GtfsSyncService } from "./gtfs-sync.service"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import { BBox } from "geojson"

const TripScheduleRelationship =
  GtfsRealtimeBindings.transit_realtime.TripDescriptor.ScheduleRelationship

const StopTimeScheduleRelationship =
  GtfsRealtimeBindings.transit_realtime.TripUpdate.StopTimeUpdate
    .ScheduleRelationship

type ITripUpdate = GtfsRealtimeBindings.transit_realtime.ITripUpdate
type IStopTimeUpdate =
  GtfsRealtimeBindings.transit_realtime.TripUpdate.IStopTimeUpdate

export interface TripStopRaw {
  trip_id: string
  stop_id: string
  route_id: string
  route_name: string
  route_color: string | null
  stop_name: string
  stop_headsign: string
  arrival_time: Date
  departure_time: Date
  start_date: string
}

export interface FetchConfig {
  url: string
  headers?: Record<string, string>
}

export interface GtfsConfig {
  static: FetchConfig
  rtTripUpdates?: FetchConfig | FetchConfig[]
}

@RegisterFeedProvider("gtfs")
export class GtfsService implements FeedProvider<GtfsConfig> {
  private logger = new Logger(GtfsService.name)
  private feedCode: string
  private config: GtfsConfig

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly syncService: GtfsSyncService,
  ) {}

  init(feedCode: string, config: GtfsConfig): void {
    this.logger = new Logger(`${GtfsService.name}[${feedCode}]`)

    this.feedCode = feedCode
    this.config = config
  }

  private async cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cacheKey = `${this.feedCode}-${key}`
    const cached = await this.cacheManager.get<T>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await fn()

    this.cacheManager.set(cacheKey, data, ttl)
    return data
  }

  async healthCheck(): Promise<void> {
    const result = await this.syncService.hasEverSynced(this.feedCode)
    if (!result) {
      throw new Error("GTFS feed has never been synced")
    }
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cached(
      "agencyBounds",
      async () => {
        const stopBounds = await this.tx(async (tx) => {
          return await sql<{
            min_lat: number
            min_lon: number
            max_lat: number
            max_lon: number
          }>`
          SELECT
            MIN(stop_lat) AS min_lat,
            MIN(stop_lon) AS min_lon,
            MAX(stop_lat) AS max_lat,
            MAX(stop_lon) AS max_lon
          FROM stops;
        `.execute(tx)
        })

        return [
          stopBounds.rows[0].min_lon,
          stopBounds.rows[0].min_lat,
          stopBounds.rows[0].max_lon,
          stopBounds.rows[0].max_lat,
        ] as [number, number, number, number]
      },
      86_400_000,
    ) // 24 hours
  }

  async sync(): Promise<void> {
    await this.syncService.importFromUrl(this.feedCode, this.config.static.url)
  }

  async tx<T>(fn: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (tx) => {
      await sql`SET LOCAL app.current_feed = '${sql.raw(
        this.feedCode,
      )}';`.execute(tx)
      return await fn(tx)
    })
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
    routeShortName: string,
    headsign: string,
  ): string {
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
  ): Promise<TripStopRaw[]> {
    const cacheKey = `schedule-${routeId}-${stopId}-${dayOffset}`
    return this.cached(
      cacheKey,
      async () => {
        const interval = `${dayOffset} days`
        const result = await this.tx(async (tx) => {
          return await sql<TripStopRaw>`
          WITH agency_timezone AS (
              SELECT agency_timezone AS tz
              FROM routes r
              JOIN agency a ON r.agency_id = a.agency_id
              WHERE r.route_id = ${routeId}
              LIMIT 1
          ),
          current_day AS (
              SELECT DATE(TIMEZONE((SELECT tz FROM agency_timezone), now() + ${interval}::interval)) AS today
          ),
          active_services AS (
              -- Services active according to the calendar table
              SELECT service_id
              FROM calendar, current_day
              WHERE today BETWEEN start_date AND end_date
                AND CASE
                    WHEN EXTRACT(DOW FROM today) = 0 THEN sunday
                    WHEN EXTRACT(DOW FROM today) = 1 THEN monday
                    WHEN EXTRACT(DOW FROM today) = 2 THEN tuesday
                    WHEN EXTRACT(DOW FROM today) = 3 THEN wednesday
                    WHEN EXTRACT(DOW FROM today) = 4 THEN thursday
                    WHEN EXTRACT(DOW FROM today) = 5 THEN friday
                    WHEN EXTRACT(DOW FROM today) = 6 THEN saturday
                    END = 1
          ),
          override_services AS (
              -- Services added on specific dates
              SELECT service_id
              FROM calendar_dates, current_day
              WHERE date = today
                AND exception_type = 1
          ),
          removed_services AS (
              -- Services removed on specific dates
              SELECT service_id
              FROM calendar_dates, current_day
              WHERE date = today
                AND exception_type = 2
          ),
          final_active_services AS (
              -- Combine active services, accounting for overrides
              SELECT DISTINCT service_id
              FROM active_services
              UNION
              SELECT service_id
              FROM override_services
              EXCEPT
              SELECT service_id
              FROM removed_services
          ),
          route_trips AS (
              -- Fetch trips for the specific route and active services
              SELECT t.trip_id, t.trip_headsign, r.route_short_name, r.route_long_name, r.route_id
              FROM trips t
              JOIN routes r ON t.route_id = r.route_id
              WHERE t.route_id = ${routeId}
                AND t.service_id IN (SELECT service_id FROM final_active_services)
          ),
          last_stops AS (
              SELECT 
                  st.trip_id,
                  st.stop_id AS last_stop_id,
                  s.stop_name AS last_stop_name
              FROM stop_times st
              JOIN stops s ON st.stop_id = s.stop_id
              WHERE st.stop_sequence = (
                  SELECT MAX(st2.stop_sequence)
                  FROM stop_times st2
                  WHERE st2.trip_id = st.trip_id
              )
          )
          -- Fetch stop_times with stop_timezone and route_short_name
          SELECT 
              st.trip_id,
              st.stop_id,
              rt.route_id,
              CASE
                  WHEN coalesce(TRIM(rt.route_short_name), '') = '' THEN rt.route_long_name
                  ELSE rt.route_short_name
              END AS route_name,
              r.route_color,
              s.stop_name,
              CASE
                  WHEN coalesce(TRIM(st.stop_headsign), '') = '' THEN
                      CASE
                          WHEN coalesce(TRIM(rt.trip_headsign), '') = '' THEN ls.last_stop_name
                          ELSE rt.trip_headsign
                      END
                  ELSE
                      st.stop_headsign
              END AS stop_headsign,
              TIMEZONE(agency_timezone.tz, current_day.today + st.arrival_time::interval) as arrival_time,
              TIMEZONE(agency_timezone.tz, current_day.today + st.departure_time::interval) as departure_time,
              to_char(current_day.today + st.arrival_time::interval, 'YYYYMMDD') as start_date
          FROM stop_times st
          JOIN route_trips rt ON st.trip_id = rt.trip_id
          JOIN routes r ON rt.route_id = r.route_id
          JOIN stops s ON st.stop_id = s.stop_id
          JOIN current_day ON true
          JOIN agency_timezone ON true
          LEFT JOIN last_stops ls ON st.trip_id = ls.trip_id
          WHERE st.stop_id = ${stopId}
          ORDER BY st.arrival_time;
        `.execute(tx)
        })

        return result.rows
      },
      43_200_000, // 12 hours
    )
  }

  async listStops(): Promise<Stop[]> {
    return this.cached(
      "stops",
      async () => {
        const stops = await this.tx(async (tx) => {
          return await tx
            .selectFrom("stops")
            .select([
              "stop_id",
              "stop_name",
              "stop_code",
              "stop_lat",
              "stop_lon",
            ])
            .execute()
        })

        return stops.map((stop) => ({
          stopId: stop.stop_id,
          stopCode: stop.stop_code,
          name: stop.stop_name,
          lat: stop.stop_lat,
          lon: stop.stop_lon,
        }))
      },
      86_400_000,
    )
  }

  async getStopsInArea(
    bbox: [number, number, number, number],
  ): Promise<Stop[]> {
    const stops = await this.tx(async (tx) => {
      return await tx
        .selectFrom("stops")
        .select(["stop_id", "stop_name", "stop_code", "stop_lat", "stop_lon"])
        .where(sql<boolean>`stop_lat BETWEEN ${bbox[1]} AND ${bbox[3]}`)
        .where(sql<boolean>`stop_lon BETWEEN ${bbox[0]} AND ${bbox[2]}`)
        .execute()
    })

    return stops.map((stop) => ({
      stopId: stop.stop_id,
      stopCode: stop.stop_code,
      name: stop.stop_name,
      lat: stop.stop_lat,
      lon: stop.stop_lon,
    }))
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cached(
      `stop-${stopId}`,
      async () => {
        const stop = await this.tx(async (tx) => {
          return await tx
            .selectFrom("stops")
            .select([
              "stop_id",
              "stop_name",
              "stop_code",
              "stop_lat",
              "stop_lon",
            ])
            .where("stop_id", "=", stopId)
            .execute()
        })

        return {
          stopId: stop[0].stop_id,
          stopCode: stop[0].stop_code,
          name: stop[0].stop_name,
          lat: stop[0].stop_lat,
          lon: stop[0].stop_lon,
        }
      },
      86_400_000,
    )
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cached(
      `routesForStop-${stopId}`,
      async () => {
        const routes = await this.tx(async (tx) => {
          return await tx
            .selectFrom("stop_times")
            .innerJoin("trips", "stop_times.trip_id", "trips.trip_id")
            .innerJoin("routes", "trips.route_id", "routes.route_id")
            .select([
              "routes.route_id",
              "routes.route_short_name",
              "routes.route_long_name",
              "routes.route_color",
              sql<string[]>`
                JSON_AGG(DISTINCT CASE 
                    WHEN coalesce(TRIM(stop_times.stop_headsign), '') = '' THEN trips.trip_headsign
                    ELSE stop_times.stop_headsign
                END)
              `.as("headsigns"),
            ])
            .where("stop_times.stop_id", "=", stopId)
            .groupBy([
              "routes.route_id",
              "routes.route_short_name",
              "routes.route_long_name",
              "routes.route_color",
            ])
            .orderBy("routes.route_short_name")
            .execute()
        })

        return routes.map((route) => ({
          routeId: route.route_id,
          color: route.route_color?.replaceAll("#", "") ?? null,
          name:
            !route.route_short_name || route.route_short_name.trim() === ""
              ? route.route_long_name
              : route.route_short_name,
          headsigns: route.headsigns
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

  async getTripUpdates(
    tripIds: string[],
  ): Promise<{ [tripId: string]: ITripUpdate }> {
    if (!this.config.rtTripUpdates) {
      return {}
    }

    const allTripUpdates = await this.cached(
      "tripUpdates",
      async () => {
        let fetchConfigs: FetchConfig[] = []
        if (Array.isArray(this.config.rtTripUpdates)) {
          fetchConfigs = this.config.rtTripUpdates
        } else {
          fetchConfigs = [this.config.rtTripUpdates]
        }

        const responses = await Promise.all(
          fetchConfigs.map(async (config) => {
            const resp = await axios.get(config.url, {
              responseType: "arraybuffer",
              responseEncoding: "binary",
              headers: config.headers,
            })

            return (
              GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                Uint8Array.from(resp.data),
              ).entity ?? []
            )
          }),
        )

        return responses.flat()
      },
      15_000,
    )

    if (typeof allTripUpdates?.[Symbol.iterator] !== "function") {
      return {}
    }

    const filteredTripUpdates: { [tripId: string]: ITripUpdate } = {}
    for (const entity of allTripUpdates) {
      if (!entity.tripUpdate) {
        continue
      }

      const tripId = entity.tripUpdate.trip.tripId
      if (tripIds.includes(tripId)) {
        const key = entity.tripUpdate.trip.startDate
          ? `${tripId}_${entity.tripUpdate.trip.startDate}`
          : tripId

        filteredTripUpdates[key] = entity.tripUpdate
      }
    }

    return filteredTripUpdates
  }

  private resolveTripTimes(
    trip: TripStopRaw,
    stopTimeUpdate?: IStopTimeUpdate,
  ) {
    let delay = 0
    if (stopTimeUpdate) {
      const hasAnyUpdate = stopTimeUpdate.arrival || stopTimeUpdate.departure
      const hasOnlyOneUpdate =
        !stopTimeUpdate.arrival || !stopTimeUpdate.departure

      if (hasAnyUpdate && hasOnlyOneUpdate) {
        delay = stopTimeUpdate.arrival?.delay ?? stopTimeUpdate.departure?.delay
        if (delay === undefined) {
          // HACK for now
          delay = 0
        }
      }
    }

    const departureTime = stopTimeUpdate?.departure?.time
      ? new Date((stopTimeUpdate.departure?.time as number) * 1000)
      : new Date(new Date(trip.departure_time).getTime() + delay * 1000)

    const arrivalTime = stopTimeUpdate?.arrival?.time
      ? new Date((stopTimeUpdate.arrival?.time as number) * 1000)
      : new Date(new Date(trip.arrival_time).getTime() + delay * 1000)

    if (arrivalTime > departureTime) {
      arrivalTime.setTime(departureTime.getTime())
    }

    return { departureTime, arrivalTime }
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    const scheduleDates = [-1, 0, 1]

    const tripStops: TripStop[] = []
    for (const scheduleDate of scheduleDates) {
      const todayTripStops: TripStop[] = []

      const trips = (
        await Promise.all(
          routes.map(({ routeId, stopId }) =>
            this.getScheduleForRouteAtStop(routeId, stopId, scheduleDate),
          ),
        )
      ).flat()

      let tripUpdates: { [tripId: string]: ITripUpdate } = {}
      try {
        tripUpdates = await this.getTripUpdates(
          trips.map((trip) => trip.trip_id),
        )
      } catch (e: any) {
        this.logger.warn(
          "Failed to fetch trip updates, using schedule",
          e.stack,
        )
      }

      trips.forEach((trip) => {
        if (todayTripStops.some((ts) => ts.tripId === trip.trip_id)) {
          return
        }

        const tripUpdate =
          tripUpdates[`${trip.trip_id}_${trip.start_date}`] ??
          tripUpdates[trip.trip_id]

        if (
          tripUpdate?.trip?.scheduleRelationship ===
          TripScheduleRelationship.CANCELED
        ) {
          return
        }

        const stopTimeUpdate = tripUpdate?.stopTimeUpdate?.find(
          (update) => update.stopId === trip.stop_id,
        )

        if (
          stopTimeUpdate?.scheduleRelationship ===
          StopTimeScheduleRelationship.SKIPPED
        ) {
          return
        }

        const { arrivalTime, departureTime } = this.resolveTripTimes(
          trip,
          stopTimeUpdate,
        )

        todayTripStops.push({
          tripId: trip.trip_id,
          routeId: trip.route_id,
          stopId: trip.stop_id,
          routeName: trip.route_name,
          routeColor: trip.route_color?.replaceAll("#", "") ?? null,
          headsign: this.removeRouteNameFromHeadsign(
            trip.route_name,
            trip.stop_headsign,
          ),
          stopName: trip.stop_name,
          arrivalTime,
          departureTime,
          isRealtime: !!tripUpdate,
        })
      })

      tripStops.push(...todayTripStops)
    }

    return tripStops
  }
}

export { TripStop, RouteAtStop }
