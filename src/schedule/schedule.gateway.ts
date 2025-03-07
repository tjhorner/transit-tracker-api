import {
  BadRequestException,
  Logger,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common"
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WsResponse,
} from "@nestjs/websockets"
import { WebSocket } from "ws"
import { IsInt, IsNotEmpty, Max, Min } from "class-validator"
import { RouteAtStop } from "src/modules/gtfs/gtfs.service"
import { Observable } from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"
import { ScheduleProvider } from "src/interfaces/schedule-provider.interface"
import {
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
} from "src/filters/ws-exception.filter"
import { MetricService } from "nestjs-otel"
import { WsThrottlerGuard } from "src/guards/ws-throttler.guard"

interface ScheduleUpdate {
  trips: ScheduleTrip[]
}

interface ScheduleTrip {
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

type RouteAtStopWithOffset = RouteAtStop & { offset: number }

export class ScheduleSubscription {
  @IsNotEmpty()
  feedCode: string

  @IsNotEmpty()
  routeStopPairs: string

  @IsInt()
  @Min(1)
  @Max(10)
  limit: number
}

interface RouteStopMetric {
  feedCode: string
  routeId: string
  stopId: string
  count: number
}

@WebSocketGateway()
@UseFilters(WebSocketExceptionFilter, WebSocketHttpExceptionFilter)
export class ScheduleGateway {
  private readonly logger = new Logger(ScheduleGateway.name)
  private readonly subscribers: Map<WebSocket, ScheduleSubscription> = new Map()
  private readonly routeStopMetrics: Map<string, RouteStopMetric> = new Map()

  constructor(
    private readonly feedService: FeedService,
    metricService: MetricService,
  ) {
    metricService
      .getObservableGauge("schedule_subscriptions", {
        description: "Number of active schedule subscriptions per feed",
        unit: "subscriptions",
      })
      .addCallback((observable) => {
        const subscribersByFeedCode = new Map<string, number>(
          Object.keys(feedService.getAllFeeds()).map((feed) => [feed, 0]),
        )

        this.subscribers.forEach((subscription) => {
          const count = subscribersByFeedCode.get(subscription.feedCode) ?? 0
          subscribersByFeedCode.set(subscription.feedCode, count + 1)
        })

        for (const [feedCode, count] of subscribersByFeedCode) {
          observable.observe(count, { feed_code: feedCode })
        }
      })

    metricService
      .getObservableGauge("route_stop_subscriptions", {
        description: "Number of active subscriptions for a route-stop pair",
        unit: "subscriptions",
      })
      .addCallback((observable) => {
        for (const [key, value] of this.routeStopMetrics) {
          observable.observe(value.count, {
            feed_code: value.feedCode,
            route_id: value.routeId,
            stop_id: value.stopId,
          })

          if (value.count === 0) {
            this.routeStopMetrics.delete(key)
          }
        }
      })
  }

  private incrementMetrics(
    value: number,
    feedCode: string,
    routeStopPairs: RouteAtStop[],
  ) {
    for (const routeStopPair of routeStopPairs) {
      const key = `${feedCode}:${routeStopPair.routeId}:${routeStopPair.stopId}`
      const metric = this.routeStopMetrics.get(key) ?? {
        feedCode,
        routeId: routeStopPair.routeId,
        stopId: routeStopPair.stopId,
        count: 0,
      }

      metric.count += value
      this.routeStopMetrics.set(key, metric)
    }
  }

  private async getUpcomingTrips(
    provider: ScheduleProvider,
    routes: RouteAtStopWithOffset[],
    limit: number,
  ): Promise<ScheduleUpdate> {
    const upcomingTrips =
      await provider.getUpcomingTripsForRoutesAtStops(routes)

    const tripDtos: ScheduleTrip[] = upcomingTrips
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
      .filter((trip) => trip.arrivalTime > Date.now() / 1000)
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .splice(0, limit)

    return {
      trips: tripDtos,
    }
  }

  @UseGuards(WsThrottlerGuard)
  @UsePipes(new ValidationPipe())
  @SubscribeMessage("schedule:subscribe")
  subscribeToSchedule(
    @MessageBody() subscription: ScheduleSubscription,
    @ConnectedSocket() socket: WebSocket,
  ): Observable<WsResponse<ScheduleUpdate | null>> {
    if (this.subscribers.has(socket)) {
      throw new BadRequestException(
        "Only one schedule subscription per connection allowed",
      )
    }

    const routeStopPairs = subscription.routeStopPairs
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

    if (routeStopPairs.length > 5) {
      throw new BadRequestException("Too many route-stop pairs; maximum 5")
    }

    const scheduleProvider = this.feedService.getScheduleProvider(
      subscription.feedCode,
    )
    if (!scheduleProvider) {
      throw new BadRequestException("Invalid feed code")
    }

    this.subscribers.set(socket, subscription)
    this.incrementMetrics(1, subscription.feedCode, routeStopPairs)

    this.logger.debug(
      `Subscribed to schedule updates for ${subscription.feedCode}, ${subscription.routeStopPairs}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return new Observable((observer) => {
      let currentSchedule: ScheduleUpdate | null = null
      async function updateSchedule() {
        let trips: ScheduleUpdate
        try {
          trips = await self.getUpcomingTrips(
            scheduleProvider,
            routeStopPairs,
            subscription.limit,
          )
        } catch (e: any) {
          observer.error(e)
        }

        if (
          currentSchedule === null ||
          JSON.stringify(currentSchedule) !== JSON.stringify(trips)
        ) {
          currentSchedule = trips
          observer.next({ event: "schedule", data: trips })
        }

        observer.next({ event: "heartbeat", data: null })
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
        this.logger.debug("Unsubscribed from schedule updates")

        clearInterval(interval)
        self.subscribers.delete(socket)
        self.incrementMetrics(-1, subscription.feedCode, routeStopPairs)
      }
    })
  }
}
