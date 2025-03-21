import {
  BadRequestException,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common"
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WsResponse,
} from "@nestjs/websockets"
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator"
import { finalize, interval, map, merge, Observable } from "rxjs"
import {
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
} from "src/filters/ws-exception.filter"
import { WebSocket as BaseWebSocket } from "ws"
import {
  ScheduleOptions,
  ScheduleService,
  ScheduleUpdate,
} from "./schedule.service"
import { randomUUID, UUID } from "crypto"

export class ScheduleSubscriptionDto {
  @IsNotEmpty()
  feedCode: string

  @IsNotEmpty()
  routeStopPairs: string

  @IsInt()
  @Min(1)
  @Max(10)
  limit: number

  @IsBoolean()
  @IsOptional()
  sortByDeparture?: boolean

  @IsString()
  @IsIn(["sequential", "nextPerRoute"])
  @IsOptional()
  listMode?: "sequential" | "nextPerRoute"
}

type WebSocket = BaseWebSocket & { id: UUID }

@WebSocketGateway()
@UseFilters(WebSocketExceptionFilter, WebSocketHttpExceptionFilter)
export class ScheduleGateway implements OnGatewayConnection {
  private readonly subscribers: Set<UUID> = new Set()

  constructor(private readonly scheduleService: ScheduleService) {}

  handleConnection(client: WebSocket) {
    client.id = randomUUID()
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage("schedule:subscribe")
  subscribeToSchedule(
    @MessageBody() subscriptionDto: ScheduleSubscriptionDto,
    @ConnectedSocket() socket: WebSocket,
  ): Observable<WsResponse<ScheduleUpdate | null>> {
    if (this.subscribers.has(socket.id)) {
      throw new BadRequestException(
        "Only one schedule subscription per connection allowed",
      )
    }

    const routeStopPairs = this.scheduleService.parseRouteStopPairs(
      subscriptionDto.routeStopPairs,
    )

    if (routeStopPairs.length > 5) {
      throw new BadRequestException("Too many route-stop pairs; maximum 5")
    }

    this.subscribers.add(socket.id)

    const subscription: ScheduleOptions = {
      feedCode: subscriptionDto.feedCode,
      routes: routeStopPairs,
      limit: subscriptionDto.limit,
      sortByDeparture: subscriptionDto.sortByDeparture,
      listMode: subscriptionDto.listMode,
    }

    const scheduleUpdates = this.scheduleService
      .subscribeToSchedule(subscription)
      .pipe(
        map((update) => ({ event: "schedule", data: update })),
        finalize(() => {
          this.subscribers.delete(socket.id)
        }),
      )

    const heartbeat = interval(30000).pipe(
      map(() => ({ event: "heartbeat", data: null })),
    )

    return merge(scheduleUpdates, heartbeat)
  }
}
