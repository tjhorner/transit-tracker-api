import { Inject, Injectable, Logger, Scope } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Counter } from "@opentelemetry/api"
import axios from "axios"
import { parse as parseCacheControl } from "cache-control-parser"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import ms, { StringValue } from "ms"
import { MetricService } from "nestjs-otel"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import type { FetchConfig, GtfsConfig } from "./config"
import { GTFS_CONFIG } from "./const"
import { IGetScheduleForRouteAtStopResult } from "./queries/list-schedule-for-route.queries"

type ITripUpdate = GtfsRt.ITripUpdate
type IStopTimeUpdate = GtfsRt.TripUpdate.IStopTimeUpdate

@Injectable({ scope: Scope.REQUEST })
export class GtfsRealtimeService {
  private readonly feedCode: string
  private readonly logger: Logger
  private readonly requestsCounter: Counter
  private readonly failuresCounter: Counter

  constructor(
    @Inject(REQUEST) { feedCode }: FeedContext<GtfsConfig>,
    @Inject(GTFS_CONFIG) private readonly config: GtfsConfig,
    private readonly cache: FeedCacheService,
    metricService: MetricService,
  ) {
    this.feedCode = feedCode
    this.logger = new Logger(`${GtfsRealtimeService.name}[${feedCode}]`)

    this.requestsCounter = metricService.getCounter("gtfs_realtime_requests", {
      description: "Number of GTFS-RT fetch requests",
      unit: "requests",
    })

    this.failuresCounter = metricService.getCounter("gtfs_realtime_failures", {
      description: "Number of GTFS-RT fetch failures",
      unit: "failures",
    })
  }

  async getTripUpdates(routeIds?: string[]): Promise<ITripUpdate[]> {
    if (!this.config.rtTripUpdates) {
      return []
    }

    let fetchConfigs: FetchConfig[] = []
    if (Array.isArray(this.config.rtTripUpdates)) {
      fetchConfigs = this.config.rtTripUpdates.filter((config) => {
        if (!config.routeIds || config.routeIds.length === 0) {
          return true
        }

        if (!routeIds || routeIds.length === 0) {
          return true
        }

        return config.routeIds.some((routeId) => routeIds.includes(routeId))
      })
    } else if (typeof this.config.rtTripUpdates === "object") {
      fetchConfigs = [this.config.rtTripUpdates]
    }

    if (fetchConfigs.length === 0) {
      return []
    }

    const minCacheAge = process.env.GTFS_RT_MIN_CACHE_AGE
      ? ms(process.env.GTFS_RT_MIN_CACHE_AGE as StringValue) / 1000
      : -1

    const responses = await Promise.allSettled(
      fetchConfigs.map((config) =>
        this.cache.cached(`tripUpdates-${config.url}`, async () => {
          this.requestsCounter.add(1, {
            feed_code: this.feedCode,
          })

          let maxAge = isNaN(minCacheAge) ? -1 : minCacheAge

          const resp = await axios.get(config.url, {
            timeout: 5000,
            responseType: "arraybuffer",
            responseEncoding: "binary",
            headers: {
              "User-Agent":
                "Transit Tracker API (https://transit-tracker.eastsideurbanism.org/)",
              ...(config.headers ?? {}),
            },
          })

          if (resp.headers["cache-control"]) {
            const directives = parseCacheControl(resp.headers["cache-control"])
            if (typeof directives["max-age"] === "number") {
              maxAge = Math.max(maxAge, directives["max-age"])
            } else if (directives["no-cache"]) {
              maxAge = Math.max(maxAge, 0)
            }
          }

          const feedMessage = GtfsRt.FeedMessage.toObject(
            GtfsRt.FeedMessage.decode(Uint8Array.from(resp.data)),
            { longs: Number },
          ) as GtfsRt.IFeedMessage

          const tripUpdates = feedMessage.entity?.filter(
            (entity) => entity.tripUpdate,
          )

          return {
            value: tripUpdates ?? [],
            ttl: maxAge >= 0 ? maxAge * 1000 : ms("15s"),
          }
        }),
      ),
    )

    for (const response of responses) {
      if (response.status === "rejected") {
        this.logger.warn(`Failed to fetch trip updates: ${response.reason}`)
        this.failuresCounter.add(1, {
          feed_code: this.feedCode,
        })
      }
    }

    const successfulResponses = responses.filter(
      (r) => r.status === "fulfilled",
    )
    if (successfulResponses.length === 0) {
      return []
    }

    const tripUpdates = successfulResponses
      .flatMap((r) => r.value)
      .map((entity) => entity.tripUpdate)
      .filter((tripUpdate) => !!tripUpdate)

    return tripUpdates
  }

  resolveTripTimes(
    trip: IGetScheduleForRouteAtStopResult,
    stopTimeUpdate?: IStopTimeUpdate,
  ) {
    const scheduledArrivalTime = new Date(trip.arrival_time)
    const scheduledDepartureTime = new Date(trip.departure_time)

    let inferredDelay = 0
    if (stopTimeUpdate) {
      const definedDelay =
        stopTimeUpdate.arrival?.delay ?? stopTimeUpdate.departure?.delay

      if (typeof definedDelay === "number") {
        inferredDelay = definedDelay
      } else {
        const hasAnyUpdate = stopTimeUpdate.arrival || stopTimeUpdate.departure
        const hasOnlyOneUpdate =
          !stopTimeUpdate.arrival || !stopTimeUpdate.departure

        if (hasAnyUpdate && hasOnlyOneUpdate) {
          // Infer delay from difference between schedule and update
          for (const key of ["arrival", "departure"] as const) {
            const time = stopTimeUpdate[key]?.time
            if (typeof time !== "number") {
              continue
            }

            inferredDelay =
              time - new Date(trip[`${key}_time`]).getTime() / 1000
          }
        }
      }
    }

    const departureTime = stopTimeUpdate?.departure?.time
      ? new Date((stopTimeUpdate.departure?.time as number) * 1000)
      : new Date(
          scheduledDepartureTime.getTime() +
            (stopTimeUpdate?.departure?.delay ?? inferredDelay) * 1000,
        )

    const arrivalTime = stopTimeUpdate?.arrival?.time
      ? new Date((stopTimeUpdate.arrival?.time as number) * 1000)
      : new Date(
          scheduledArrivalTime.getTime() +
            (stopTimeUpdate?.arrival?.delay ?? inferredDelay) * 1000,
        )

    if (arrivalTime > departureTime) {
      departureTime.setTime(arrivalTime.getTime())
    }

    const maximumDeviationFromSchedule = Math.max(
      Math.abs(departureTime.getTime() - scheduledDepartureTime.getTime()),
      Math.abs(arrivalTime.getTime() - scheduledArrivalTime.getTime()),
    )

    if (maximumDeviationFromSchedule > ms("90m")) {
      // Low confidence prediction, following Transit's guidelines:
      // https://resources.transitapp.com/article/462-trip-updates#rbest
      return {
        departureTime: scheduledDepartureTime,
        arrivalTime: scheduledArrivalTime,
        isRealtime: false,
      }
    }

    return {
      departureTime,
      arrivalTime,
      isRealtime: !!stopTimeUpdate,
    }
  }

  private isTripIdSimilar(
    trip: IGetScheduleForRouteAtStopResult,
    tripUpdate: ITripUpdate,
  ): boolean {
    if (trip.trip_id === tripUpdate.trip.tripId) {
      return true
    }

    if (this.config.quirks?.fuzzyMatchTripUpdates && tripUpdate.trip.tripId) {
      return trip.trip_id.includes(tripUpdate.trip.tripId)
    }

    return false
  }

  matchTripToTripUpdate(
    trip: IGetScheduleForRouteAtStopResult,
    tripUpdates: ITripUpdate[],
  ): {
    tripUpdate: ITripUpdate | undefined
    stopTimeUpdate: IStopTimeUpdate | undefined
    vehicle: string | null
  } {
    // Filter by trip updates with:
    //   - the same trip_id and start_date *or*
    //   - the same trip_id and no start_date
    const tripUpdate = tripUpdates.find((update) => {
      const tripIdMatches = this.isTripIdSimilar(trip, update)
      return (
        (tripIdMatches && update.trip.startDate === trip.start_date) ||
        (tripIdMatches && !update.trip.startDate)
      )
    })

    let stopTimeUpdate = tripUpdate?.stopTimeUpdate?.find(
      (update) =>
        update.stopSequence === trip.stop_sequence ||
        update.stopId === trip.stop_id,
    )

    // If no exact match, find the latest stop update before our stop as fallback
    if (!stopTimeUpdate && tripUpdate?.stopTimeUpdate) {
      const previousStopUpdates = tripUpdate.stopTimeUpdate
        .filter(
          (update) =>
            typeof update.stopSequence === "number" &&
            update.stopSequence < trip.stop_sequence,
        )
        .sort((a, b) => b.stopSequence! - a.stopSequence!)

      if (previousStopUpdates.length > 0) {
        const latestUpdate = previousStopUpdates[0]

        // Synthesize stop time update with only delay
        stopTimeUpdate = {
          departure: {
            delay: latestUpdate.departure?.delay,
          },
          arrival: {
            delay: latestUpdate.arrival?.delay,
          },
        }
      }
    }

    const vehicle = tripUpdate?.vehicle?.label ?? null

    return { tripUpdate, stopTimeUpdate, vehicle }
  }
}
