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
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WsResponse,
} from "@nestjs/websockets"
import * as Sentry from "@sentry/nestjs"
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
import { randomUUID, UUID } from "crypto"
import {
  catchError,
  finalize,
  interval,
  map,
  merge,
  Observable,
  retry,
} from "rxjs"
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

export class ScheduleSubscriptionDto {
  @IsString()
  @IsOptional()
  feedCode?: string

  @IsNotEmpty()
  routeStopPairs!: string

  @IsInt()
  @Min(1)
  @Max(10)
  limit!: number

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
  private readonly logger = new Logger(ScheduleGateway.name)
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

    if (subscriptionDto.feedCode === "") {
      subscriptionDto.feedCode = undefined
    }

    this.subscribers.add(socket.id)

    const subscription: ScheduleOptions = {
      feedCode: subscriptionDto.feedCode,
      routes: routeStopPairs,
      limit: subscriptionDto.limit,
      sortByDeparture: subscriptionDto.sortByDeparture,
      listMode: subscriptionDto.listMode,
    }

    const scheduleUpdates$ = this.scheduleService
      .subscribeToSchedule(subscription)
      .pipe(
        map((update) => ({ event: "schedule", data: update })),
        catchError((err) => {
          this.logger.warn(
            {
              message: "Error in schedule subscription",
              error: err.message,
              subscription,
            },
            err.stack,
          )

          Sentry.captureException(err, {
            extra: {
              subscription: JSON.stringify(subscription),
            },
          })

          throw err
        }),
        retry({
          delay: 10_000,
        }),
        finalize(() => {
          this.subscribers.delete(socket.id)
        }),
      )

    const heartbeat$ = interval(30000).pipe(
      map(() => ({ event: "heartbeat", data: null })),
    )

    return merge(scheduleUpdates$, heartbeat$)
  }
}
