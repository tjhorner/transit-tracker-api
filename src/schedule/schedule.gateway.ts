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
  OnGatewayDisconnect,
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
import { IncomingMessage } from "http"
import ms from "ms"
import proxyAddr from "proxy-addr"
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
  @Max(20)
  limit!: number

  @IsBoolean()
  @IsOptional()
  sortByDeparture?: boolean

  @IsString()
  @IsIn(["sequential", "nextPerRoute"])
  @IsOptional()
  listMode?: "sequential" | "nextPerRoute"
}

type WebSocket = BaseWebSocket & {
  id: UUID
  ipAddress: string
  connectedAt: Date
}

@WebSocketGateway()
@UseFilters(WebSocketExceptionFilter, WebSocketHttpExceptionFilter)
export class ScheduleGateway
  implements OnGatewayConnection<WebSocket>, OnGatewayDisconnect<WebSocket>
{
  private readonly logger = new Logger(ScheduleGateway.name)
  private readonly subscribers: Set<UUID> = new Set()

  constructor(private readonly scheduleService: ScheduleService) {}

  handleConnection(client: WebSocket, request: IncomingMessage) {
    client.connectedAt = new Date()
    client.id = randomUUID()
    client.ipAddress = proxyAddr(request, (_, i) => i < 2)

    client.on("error", (err) => {
      this.logger.warn(
        `WebSocket error for client ${client.id} - ${client.ipAddress}: ${err.message}`,
      )
    })

    this.logger.debug(`Client connected: ${client.id} - ${client.ipAddress}`)
  }

  handleDisconnect(client: WebSocket) {
    this.logger.debug(
      `Client disconnected: ${client.id} - ${client.ipAddress} (code: ${(client as any)._closeCode}, session duration: ${(Date.now() - client.connectedAt.getTime()) / 1000}s)`,
    )

    if ((client as any)._closeCode === 1006) {
      this.logger.warn(
        `Client ${client.id} - ${client.ipAddress} disconnected unexpectedly (code 1006)`,
      )
    }
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

    if (routeStopPairs.length > 25) {
      throw new BadRequestException("Too many route-stop pairs; maximum 25")
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
          delay: ms("10s"),
        }),
        finalize(() => {
          this.subscribers.delete(socket.id)
        }),
      )

    const heartbeat$ = interval(ms("30s")).pipe(
      map(() => ({ event: "heartbeat", data: null })),
    )

    return merge(scheduleUpdates$, heartbeat$)
  }
}
