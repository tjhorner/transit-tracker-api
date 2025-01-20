import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager"
import { Inject, Injectable, Logger } from "@nestjs/common"
import axios from "axios"
import { Kysely, sql, Transaction } from "kysely"
import { InjectKysely } from "nestjs-kysely"
import { DB } from "./db"
import {
  BBox,
  RouteAtStop,
  ScheduleProvider,
  Stop,
  StopRoute,
  TripStop,
} from "src/interfaces/schedule-provider.interface"
import GtfsRealtimeBindings from "gtfs-realtime-bindings"
import { SchedulerRegistry } from "@nestjs/schedule"
import { CronJob } from "cron"
import { GtfsSyncService } from "./gtfs-sync.service"

type ITripUpdate = GtfsRealtimeBindings.transit_realtime.ITripUpdate

export interface TripStopRaw {
  trip_id: string
  stop_id: string
  route_id: string
  route_name: string
  stop_name: string
  stop_headsign: string
  arrival_time: string
  departure_time: string
  stop_timezone: string
}

export interface FetchConfig {
  url: string
  headers?: Record<string, string>
}

export interface GtfsConfig {
  static: FetchConfig
  rtTripUpdates?: FetchConfig
}

@Injectable()
export class GtfsService implements ScheduleProvider<GtfsConfig> {
  private readonly logger = new Logger(GtfsService.name)
  private feedCode: string
  private config: GtfsConfig

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly syncService: GtfsSyncService,
  ) {}

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
          stopBounds.rows[0].min_lat,
          stopBounds.rows[0].min_lon,
          stopBounds.rows[0].max_lat,
          stopBounds.rows[0].max_lon,
        ] as [number, number, number, number]
      },
      86_400_000,
    ) // 24 hours
  }

  init(feedCode: string, config: GtfsConfig): void {
    this.feedCode = feedCode
    this.config = config

    const refreshJob = new CronJob("0 0 * * *", async () => {
      this.logger.log(`Refreshing GTFS feed ${feedCode}`)
      await this.syncService.importFromUrl(feedCode, config.static.url)
    })

    // @ts-ignore
    // this.schedulerRegistry.addCronJob(`refresh_static_${feedCode}`, refreshJob)
    // refreshJob.start()
  }

  async sync(): Promise<void> {
    await this.syncService.importFromUrl(this.feedCode, this.config.static.url)
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

  async tx<T>(fn: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (tx) => {
      await sql`SET LOCAL app.current_feed = '${sql.raw(
        this.feedCode,
      )}';`.execute(tx)
      return await fn(tx)
    })
  }

  async getScheduleForRouteAtStop(
    routeId: string,
    stopId: string,
    day: Date = new Date(),
  ): Promise<TripStopRaw[]> {
    const dayMidnight = new Date(day)
    dayMidnight.setHours(0, 0, 0, 0)

    const cacheKey = `schedule-${routeId}-${stopId}-${dayMidnight.getTime()}`
    return this.cached(
      cacheKey,
      async () => {
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
              SELECT (${day} AT TIME ZONE (SELECT tz FROM agency_timezone))::date AS today
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
                  WHEN TRIM(rt.route_short_name) = '' THEN rt.route_long_name
                  ELSE rt.route_short_name
              END AS route_name,
              s.stop_name,
              CASE
                  WHEN TRIM(st.stop_headsign) = '' THEN
                      CASE
                          WHEN TRIM(rt.trip_headsign) = '' THEN ls.last_stop_name
                          ELSE rt.trip_headsign
                      END
                  ELSE
                      st.stop_headsign
              END AS stop_headsign,
              st.arrival_time,
              st.departure_time,
              s.stop_timezone
          FROM stop_times st
          JOIN route_trips rt ON st.trip_id = rt.trip_id
          JOIN stops s ON st.stop_id = s.stop_id
          LEFT JOIN last_stops ls ON st.trip_id = ls.trip_id
          WHERE st.stop_id = ${stopId}
          ORDER BY st.arrival_time;
        `.execute(tx)
        })

        return result.rows
      },
      86_400_000,
    ) // 24 hours
  }

  async getStopsInArea(
    bbox: [number, number, number, number],
  ): Promise<Stop[]> {
    const stops = await this.tx(async (tx) => {
      return await tx
        .selectFrom("stops")
        .select(["stop_id", "stop_name", "stop_code", "stop_lat", "stop_lon"])
        .where(sql<boolean>`stop_lat BETWEEN ${bbox[0]} AND ${bbox[2]}`)
        .where(sql<boolean>`stop_lon BETWEEN ${bbox[1]} AND ${bbox[3]}`)
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

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    const routes = await this.tx(async (tx) => {
      return await tx
        .selectFrom("stop_times")
        .innerJoin("trips", "stop_times.trip_id", "trips.trip_id")
        .innerJoin("routes", "trips.route_id", "routes.route_id")
        .select([
          "routes.route_id",
          "routes.route_short_name",
          "routes.route_long_name",
          sql<string[]>`
            JSON_AGG(DISTINCT CASE 
                WHEN TRIM(stop_times.stop_headsign) = '' THEN trips.trip_headsign
                ELSE stop_times.stop_headsign
            END)
          `.as("headsigns"),
        ])
        .where("stop_times.stop_id", "=", stopId)
        .groupBy([
          "routes.route_id",
          "routes.route_short_name",
          "routes.route_long_name",
        ])
        .orderBy("routes.route_short_name")
        .execute()
    })

    return routes.map((route) => ({
      routeId: route.route_id,
      name:
        route.route_short_name.trim() === ""
          ? route.route_long_name
          : route.route_short_name,
      headsigns: route.headsigns.filter((headsign) => headsign.trim() !== ""),
    }))
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
        const response = await axios.get(this.config.rtTripUpdates.url, {
          responseType: "arraybuffer",
          responseEncoding: "binary",
          headers: this.config.rtTripUpdates.headers,
        })

        return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
          Uint8Array.from(response.data),
        )
      },
      15_000,
    )

    const filteredTripUpdates: { [tripId: string]: ITripUpdate } = {}
    for (const entity of allTripUpdates.entity) {
      const tripId = entity.tripUpdate.trip.tripId
      if (tripIds.includes(tripId)) {
        filteredTripUpdates[`${tripId}_${entity.tripUpdate.trip.startDate}`] =
          entity.tripUpdate
      }
    }

    return filteredTripUpdates
  }

  private parseTripTime(time: string, onDay: Date): Date {
    const date = new Date(onDay)
    const [hours, minutes, seconds] = time
      .split(":")
      .map((part) => parseInt(part, 10))
    date.setHours(hours)
    date.setMinutes(minutes)
    date.setSeconds(seconds)
    date.setMilliseconds(0)
    return date
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    const scheduleDates = [
      new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
      new Date(),
      new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
    ]

    const tripStops: TripStop[] = []
    for (const scheduleDate of scheduleDates) {
      const trips = (
        await Promise.all(
          routes.map(({ routeId, stopId }) =>
            this.getScheduleForRouteAtStop(routeId, stopId, scheduleDate),
          ),
        )
      ).flat()

      const tripUpdates = await this.getTripUpdates(
        trips.map((trip) => trip.trip_id),
      )

      const startDate = `${scheduleDate.getFullYear()}${String(
        scheduleDate.getMonth() + 1,
      ).padStart(2, "0")}${String(scheduleDate.getDate()).padStart(2, "0")}`

      trips.forEach((trip) => {
        const tripUpdate = tripUpdates[`${trip.trip_id}_${startDate}`]

        const stopTimeUpdate = tripUpdate?.stopTimeUpdate.find(
          (update) => update.stopId === trip.stop_id,
        )

        const arrivalTime = stopTimeUpdate?.arrival?.time
          ? new Date((stopTimeUpdate.arrival?.time as number) * 1000)
          : this.parseTripTime(trip.arrival_time, scheduleDate)

        if (arrivalTime < new Date()) {
          return
        }

        const departureTime = stopTimeUpdate?.departure?.time
          ? new Date((stopTimeUpdate.departure?.time as number) * 1000)
          : this.parseTripTime(trip.departure_time, scheduleDate)

        tripStops.push({
          tripId: trip.trip_id,
          routeId: trip.route_id,
          stopId: trip.stop_id,
          routeName: trip.route_name,
          headsign: trip.stop_headsign,
          stopName: trip.stop_name,
          arrivalTime,
          departureTime,
          isRealtime: !!tripUpdate,
        })
      })
    }

    return tripStops
  }
}

export { TripStop, RouteAtStop }
