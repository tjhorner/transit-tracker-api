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
  WebSocketServer,
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
import ms, { StringValue } from "ms"
import proxyAddr from "proxy-addr"
import {
  finalize,
  interval,
  map,
  merge,
  Observable,
  retry,
  startWith,
  switchMap,
  timer,
} from "rxjs"
import { DomainError } from "src/errors/domain-error"
import { WebSocketDomainExceptionFilter } from "src/filters/domain-exception.filter"
import {
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
} from "src/filters/ws-exception.filter"
import { captureWsException, ConnectedClient } from "src/sentry/websocket"
import { WebSocket as BaseWebSocket, Server as WsServer } from "ws"
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

type WebSocket = ConnectedClient

@WebSocketGateway()
@UseFilters(
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
  WebSocketDomainExceptionFilter,
)
export class ScheduleGateway
  implements OnGatewayConnection<WebSocket>, OnGatewayDisconnect<WebSocket>
{
  private readonly logger = new Logger(ScheduleGateway.name)
  private readonly subscribers: Set<UUID> = new Set()

  // Delay before a subscription begins fetching schedule data and registering
  // metrics. Connections that drop within this window cost nothing, which
  // protects against clients that rapidly connect and disconnect in a loop
  private readonly subscribeGracePeriodMs = process.env
    .SCHEDULE_SUBSCRIBE_GRACE_PERIOD
    ? ms(process.env.SCHEDULE_SUBSCRIBE_GRACE_PERIOD as StringValue)
    : ms("1s")

  @WebSocketServer()
  private readonly server!: WsServer

  constructor(private readonly scheduleService: ScheduleService) {}

  get connectionCount(): number {
    if (!this.server) {
      return 0
    }

    let count = 0
    for (const client of this.server.clients) {
      if (client.readyState === BaseWebSocket.OPEN) {
        count++
      }
    }
    return count
  }

  shedConnections(target: number, code: number): number {
    if (!this.server || target <= 0) {
      return 0
    }

    let closed = 0
    for (const client of this.server.clients) {
      if (closed >= target) {
        break
      }
      if (client.readyState !== BaseWebSocket.OPEN) {
        continue
      }
      client.close(code)
      closed++
    }
    return closed
  }

  handleConnection(client: WebSocket, request: IncomingMessage) {
    client.connectedAt = performance.now()
    client.id = randomUUID()
    client.ipAddress = proxyAddr(request, (_, i) => i < 2)
    client.headers = request.headers
    client.requestUrl = request.url

    client.on("error", (err) => {
      this.logger.warn(
        `WebSocket error for client ${client.id} - ${client.ipAddress}: ${err.message}`,
      )
    })

    const headersString = Object.entries(request.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ")

    this.logger.debug(
      `Client connected: ${client.id} - ${client.ipAddress} (${headersString})`,
    )
  }

  handleDisconnect(client: WebSocket) {
    this.logger.debug(
      `Client disconnected: ${client.id} - ${client.ipAddress} (code: ${(client as any)._closeCode}, session duration: ${(performance.now() - client.connectedAt) / 1000}s)`,
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

    const schedule$ = this.scheduleService.subscribeToSchedule(subscription)

    const scheduleUpdates$ = timer(this.subscribeGracePeriodMs).pipe(
      switchMap(() =>
        schedule$.pipe(
          retry({
            delay: (err, retryCount) => {
              this.logger.warn(
                {
                  message: "Error in schedule subscription",
                  error: err.message,
                  subscription,
                },
                err.stack,
              )

              let level: Sentry.SeverityLevel = "error"
              if (
                err instanceof DomainError &&
                ["notFound", "invalidInput"].includes(err.kind)
              ) {
                // not fatal, but log for troubleshooting and visibility into bad client behavior
                level = "warning"
              }

              captureWsException(socket, err, {
                level,
                extra: {
                  subscription: JSON.stringify(subscription),
                  retryCount,
                },
              })

              return timer(ms("10s"))
            },
          }),
        ),
      ),
      map((update) => ({ event: "schedule", data: update })),
      finalize(() => {
        this.subscribers.delete(socket.id)
      }),
    )

    const heartbeat$ = interval(ms("30s")).pipe(
      startWith(0),
      map(() => ({ event: "heartbeat", data: null })),
    )

    return merge(scheduleUpdates$, heartbeat$)
  }
}
