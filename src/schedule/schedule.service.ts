import { BadRequestException, Injectable, Logger } from "@nestjs/common"
import { Observable } from "rxjs"
import {
  RouteAtStop,
  ScheduleProvider,
} from "src/interfaces/schedule-provider.interface"
import { FeedService } from "src/modules/feed/feed.service"
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
  isRealtime: boolean
}

export interface ScheduleUpdate {
  trips: ScheduleTrip[]
}

export type RouteAtStopWithOffset = RouteAtStop & { offset: number }

export interface ScheduleOptions {
  feedCode: string
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

  private async getUpcomingTrips(
    provider: ScheduleProvider,
    { routes, limit, sortByDeparture, listMode }: ScheduleOptions,
  ): Promise<ScheduleUpdate> {
    const upcomingTrips =
      await provider.getUpcomingTripsForRoutesAtStops(routes)

    const sortKey = sortByDeparture ? "departureTime" : "arrivalTime"
    let trips: ScheduleTrip[] = upcomingTrips
      .map((trip) => {
        const offset = routes.find(
          (r) => r.routeId === trip.routeId && r.stopId === trip.stopId,
        ).offset

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

      const pairs = new Set<string>()
      trips.forEach((trip) => pairs.add(pairKey(trip)))

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

  getSchedule(options: ScheduleOptions): Promise<ScheduleUpdate> {
    const provider = this.feedService.getScheduleProvider(options.feedCode)
    if (!provider) {
      throw new BadRequestException("Invalid feed code")
    }

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
    }

    return routeStopPairs
  }

  subscribeToSchedule(
    subscription: ScheduleOptions,
  ): Observable<ScheduleUpdate | null> {
    const scheduleProvider = this.feedService.getScheduleProvider(
      subscription.feedCode,
    )
    if (!scheduleProvider) {
      throw new BadRequestException("Invalid feed code")
    }

    this.logger.debug(
      `Subscribed to schedule updates ${subscription.feedCode}, ${JSON.stringify(subscription)}`,
    )

    this.metricsService.add(subscription)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return new Observable((observer) => {
      let currentSchedule: ScheduleUpdate | null = null
      async function updateSchedule() {
        let trips: ScheduleUpdate
        try {
          trips = await self.getUpcomingTrips(scheduleProvider, subscription)
        } catch (e: any) {
          observer.error(e)
        }

        if (
          currentSchedule === null ||
          JSON.stringify(currentSchedule) !== JSON.stringify(trips)
        ) {
          currentSchedule = trips
          observer.next(trips)
        }
      }

      let interval: ReturnType<typeof setInterval>
      setTimeout(
        () => {
          const jitter = Math.floor(Math.random() * 1000)
          interval = setInterval(updateSchedule, 30_000 + jitter)
        },
        Math.floor(Math.random() * 10000),
      )

      updateSchedule()

      return () => {
        self.logger.debug("Unsubscribed from schedule updates")
        clearInterval(interval)

        self.metricsService.remove(subscription)
      }
    })
  }
}
