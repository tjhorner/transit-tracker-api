import {
  BadRequestException,
  Logger,
  UseFilters,
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
import { WebSocketHttpExceptionFilter } from "src/filters/ws-exception-filter"

interface ScheduleUpdate {
  trips: ScheduleTrip[]
}

interface ScheduleTrip {
  tripId: string
  routeId: string
  routeName: string
  stopId: string
  stopName: string
  headsign: string
  arrivalTime: number
  departureTime: number
  isRealtime: boolean
}

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

@WebSocketGateway()
@UseFilters(WebSocketHttpExceptionFilter)
export class ScheduleGateway {
  private readonly logger = new Logger(ScheduleGateway.name)
  private subscribers: Set<WebSocket> = new Set()

  constructor(private readonly feedService: FeedService) {}

  private async getUpcomingTrips(
    provider: ScheduleProvider,
    routes: RouteAtStop[],
    limit: number,
  ): Promise<ScheduleUpdate> {
    let upcomingTrips = await provider.getUpcomingTripsForRoutesAtStops(routes)

    const tripDtos: ScheduleTrip[] = upcomingTrips
      .map((trip) => ({
        ...trip,
        arrivalTime: trip.arrivalTime.getTime() / 1000,
        departureTime: trip.departureTime.getTime() / 1000,
      }))
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .splice(0, limit)

    return {
      trips: tripDtos,
    }
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage("schedule:subscribe")
  subscribeToSchedule(
    @MessageBody() subscription: ScheduleSubscription,
    @ConnectedSocket() socket: WebSocket,
  ): Observable<WsResponse<ScheduleUpdate>> {
    if (this.subscribers.has(socket)) {
      throw new BadRequestException(
        "Only one schedule subscription per connection allowed",
      )
    }

    const routeStopPairs = subscription.routeStopPairs
      .split(";")
      .map((pair) => pair.split(",").map((part) => part.trim()))
      .map(([routeId, stopId]) => ({ routeId, stopId }))

    if (routeStopPairs.length > 5) {
      throw new BadRequestException("Too many route-stop pairs; maximum 5")
    }

    const scheduleProvider = this.feedService.getScheduleProvider(
      subscription.feedCode,
    )
    if (!scheduleProvider) {
      throw new BadRequestException("Invalid feed code")
    }

    this.subscribers.add(socket)

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
      }

      const interval = setInterval(updateSchedule, 15000)
      updateSchedule()

      return () => {
        clearInterval(interval)
        self.subscribers.delete(socket)
      }
    })
  }
}
