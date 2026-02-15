import { BadRequestException, Injectable, Logger } from "@nestjs/common"
import { SentryTraced } from "@sentry/nestjs"
import * as Sentry from "@sentry/node"
import ms from "ms"
import {
  concat,
  defer,
  distinctUntilChanged,
  finalize,
  from,
  mergeMap,
  Observable,
  share,
  timer,
} from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"
import type {
  FeedProvider,
  RouteAtStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { ScheduleMetricsService } from "./schedule-metrics.service"

export interface ScheduleTrip {
  tripId: string
  routeId: string
  routeName: string
  routeColor: string | null
  stopId: string
  stopName: string
  headsign: string
  arrivalTime: number
  departureTime: number
  vehicle: string | null
  isRealtime: boolean
}

export interface ScheduleUpdate {
  trips: ScheduleTrip[]
}

export type RouteAtStopWithOffset = RouteAtStop & { offset: number }

export interface ScheduleOptions {
  feedCode?: string
  routes: RouteAtStopWithOffset[]
  limit: number
  sortByDeparture?: boolean
  listMode?: "sequential" | "nextPerRoute"
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name)

  constructor(
    private readonly feedService: FeedService,
    private readonly metricsService: ScheduleMetricsService,
  ) {}

  @SentryTraced()
  private async getUpcomingTrips(
    provider: FeedProvider,
    { routes, limit, sortByDeparture, listMode }: ScheduleOptions,
  ): Promise<ScheduleUpdate> {
    const span = Sentry.getActiveSpan()
    if (span) {
      span.setAttribute("schedule_options.routes", JSON.stringify(routes))
      span.setAttribute("schedule_options.limit", limit)
      span.setAttribute("schedule_options.sortByDeparture", sortByDeparture)
      span.setAttribute("schedule_options.listMode", listMode)
    }

    const upcomingTrips =
      await provider.getUpcomingTripsForRoutesAtStops(routes)

    const sortKey = sortByDeparture ? "departureTime" : "arrivalTime"
    let trips: ScheduleTrip[] = upcomingTrips
      .map((trip) => {
        const offset = routes.find(
          (r) => r.routeId === trip.routeId && r.stopId === trip.stopId,
        )?.offset

        return {
          ...trip,
          arrivalTime:
            new Date(trip.arrivalTime).getTime() / 1000 + (offset ?? 0),
          departureTime:
            new Date(trip.departureTime).getTime() / 1000 + (offset ?? 0),
        }
      })
      .filter((trip) => trip[sortKey] > Date.now() / 1000)
      .sort((a, b) => a[sortKey] - b[sortKey])

    if (listMode === "nextPerRoute") {
      const pairKey = (trip: ScheduleTrip) => `${trip.routeId}-${trip.stopId}`

      const pairs = new Set<string>(trips.map((trip) => pairKey(trip)))

      trips = trips.filter((trip) => {
        const key = pairKey(trip)
        if (pairs.has(key)) {
          pairs.delete(key)
          return true
        }
        return false
      })
    }

    trips = trips.slice(0, limit)

    return {
      trips,
    }
  }

  private getFeedProvider(options: ScheduleOptions): FeedProvider {
    if (options.feedCode) {
      const provider = this.feedService.getFeedProvider(options.feedCode)
      if (!provider) {
        throw new BadRequestException("Invalid feed code")
      }

      return provider
    }

    return this.feedService.all
  }

  getSchedule(options: ScheduleOptions): Promise<ScheduleUpdate> {
    const provider = this.getFeedProvider(options)
    return this.getUpcomingTrips(provider, options)
  }

  parseRouteStopPairs(routeStopPairsRaw: string): RouteAtStopWithOffset[] {
    const routeStopPairs = routeStopPairsRaw
      .split(";")
      .map((pair) => pair.split(",").map((part) => part.trim()))
      .map(([routeId, stopId, offset]) => ({
        routeId,
        stopId,
        offset: parseInt(offset ?? "0"),
      }))

    for (const pair of routeStopPairs) {
      if (!pair.routeId || !pair.stopId) {
        throw new BadRequestException(
          "Invalid route-stop pair; must be in the format routeId,stopId[,offset]",
        )
      }

      if (isNaN(pair.offset)) {
        throw new BadRequestException("Invalid offset; must be a number")
      }
    }

    return routeStopPairs
  }

  subscribeToSchedule(
    subscription: ScheduleOptions,
  ): Observable<ScheduleUpdate | null> {
    const feedProvider = this.getFeedProvider(subscription)

    return defer(() => {
      this.logger.verbose(
        `Subscribed to schedule updates: ${JSON.stringify(subscription)}`,
      )

      this.metricsService.add(subscription)

      const initialDelay = Math.floor(Math.random() * 10000)
      const jitter = Math.floor(Math.random() * 1000)
      const period = ms("30s") + jitter

      const getTrips$ = defer(() =>
        from(this.getUpcomingTrips(feedProvider, subscription)),
      )

      return concat(
        getTrips$,
        timer(initialDelay, period).pipe(mergeMap(() => getTrips$)),
      ).pipe(
        distinctUntilChanged(
          (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr),
        ),
        finalize(() => {
          this.logger.verbose(
            `Unsubscribed from schedule updates: ${JSON.stringify(subscription)}`,
          )

          this.metricsService.remove(subscription)
        }),
      )
    }).pipe(share())
  }
}
