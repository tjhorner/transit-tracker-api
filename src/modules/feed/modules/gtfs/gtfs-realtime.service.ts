import { Inject, Injectable, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import axios from "axios"
import { parse as parseCacheControl } from "cache-control-parser"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import ms from "ms"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { FetchConfig, GtfsConfig } from "./config"
import { IGetScheduleForRouteAtStopResult } from "./queries/list-schedule-for-route.queries"

type ITripUpdate = GtfsRt.ITripUpdate
type IStopTimeUpdate = GtfsRt.TripUpdate.IStopTimeUpdate

@Injectable()
export class GtfsRealtimeService {
  private readonly config: GtfsConfig
  private readonly logger: Logger

  constructor(@Inject(REQUEST) { feedCode, config }: FeedContext<GtfsConfig>) {
    this.logger = new Logger(`${GtfsRealtimeService.name}[${feedCode}]`)
    this.config = config
  }

  async getTripUpdates() {
    let fetchConfigs: FetchConfig[] = []
    if (Array.isArray(this.config.rtTripUpdates)) {
      fetchConfigs = this.config.rtTripUpdates
    } else if (typeof this.config.rtTripUpdates === "object") {
      fetchConfigs = [this.config.rtTripUpdates]
    }

    let maxAge = -1
    const responses = await Promise.allSettled(
      fetchConfigs.map(async (config) => {
        const resp = await axios.get(config.url, {
          responseType: "arraybuffer",
          responseEncoding: "binary",
          headers: config.headers,
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
        )

        return feedMessage.entity ?? []
      }),
    )

    for (const response of responses) {
      if (response.status === "rejected") {
        this.logger.warn(`Failed to fetch trip updates`, response.reason)
      }
    }

    const successfulResponses = responses.filter(
      (r) => r.status === "fulfilled",
    )
    if (successfulResponses.length === 0) {
      return {
        value: [],
        ttl: 0,
      }
    }

    const tripUpdates = successfulResponses.flatMap((r) => r.value)
    return {
      value: tripUpdates,
      ttl: maxAge >= 0 ? maxAge * 1000 : ms("15s"),
    }
  }

  resolveTripTimes(
    trip: IGetScheduleForRouteAtStopResult,
    stopTimeUpdate?: IStopTimeUpdate,
  ) {
    const scheduledArrivalTime = new Date(trip.arrival_time)
    const scheduledDepartureTime = new Date(trip.departure_time)

    let delay = 0
    if (stopTimeUpdate) {
      const hasAnyUpdate = stopTimeUpdate.arrival || stopTimeUpdate.departure
      const hasOnlyOneUpdate =
        !stopTimeUpdate.arrival || !stopTimeUpdate.departure

      if (hasAnyUpdate && hasOnlyOneUpdate) {
        const definedDelay =
          stopTimeUpdate.arrival?.delay ?? stopTimeUpdate.departure?.delay

        if (definedDelay) {
          delay = definedDelay
        } else {
          // Infer delay from difference between schedule and update
          for (const key of ["arrival", "departure"] as const) {
            const time = stopTimeUpdate[key]?.time
            if (typeof time !== "number") {
              continue
            }

            delay = time - new Date(trip[`${key}_time`]).getTime() / 1000
          }
        }
      }
    }

    const departureTime = stopTimeUpdate?.departure?.time
      ? new Date((stopTimeUpdate.departure?.time as number) * 1000)
      : new Date(scheduledDepartureTime.getTime() + delay * 1000)

    const arrivalTime = stopTimeUpdate?.arrival?.time
      ? new Date((stopTimeUpdate.arrival?.time as number) * 1000)
      : new Date(scheduledArrivalTime.getTime() + delay * 1000)

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

  matchTripToTripUpdate(
    trip: IGetScheduleForRouteAtStopResult,
    tripUpdates: ITripUpdate[],
  ): {
    tripUpdate: ITripUpdate | undefined
    stopTimeUpdate: IStopTimeUpdate | undefined
  } {
    // Filter by trip updates with:
    //   - the same trip_id and start_date *or*
    //   - the same trip_id and no start_date
    const tripUpdate = tripUpdates.find(
      (update) =>
        (update.trip.tripId === trip.trip_id &&
          update.trip.startDate === trip.start_date) ||
        (!update.trip.startDate && update.trip.tripId === trip.trip_id),
    )

    const stopTimeUpdate = tripUpdate?.stopTimeUpdate?.find(
      (update) =>
        update.stopSequence === trip.stop_sequence ||
        update.stopId === trip.stop_id,
    )

    return { tripUpdate, stopTimeUpdate }
  }
}
