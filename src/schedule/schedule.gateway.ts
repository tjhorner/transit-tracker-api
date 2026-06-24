import {
  BadRequestException,
  UseFilters,
  UseInterceptors,
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
import ms from "ms"
import { InjectPinoLogger, PinoLogger } from "nestjs-pino"
import { storage, Store } from "nestjs-pino/storage"
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
import { env } from "src/env"
import { DomainError } from "src/errors/domain-error"
import { WebSocketDomainExceptionFilter } from "src/filters/domain-exception.filter"
import {
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
} from "src/filters/ws-exception.filter"
import { WsLogContextInterceptor } from "src/interceptors/ws-log-context.interceptor"
import { captureWsException, createConnectionScope } from "src/sentry/websocket"
import { WebSocket, Server as WsServer } from "ws"
import { ConnectedClient, parseClientVersions } from "./client"
import { ScheduleMetricsService } from "./schedule-metrics.service"
import {
  RouteAtStopWithOffset,
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

@WebSocketGateway()
@UseInterceptors(WsLogContextInterceptor)
@UseFilters(
  WebSocketExceptionFilter,
  WebSocketHttpExceptionFilter,
  WebSocketDomainExceptionFilter,
)
export class ScheduleGateway
  implements
    OnGatewayConnection<ConnectedClient>,
    OnGatewayDisconnect<ConnectedClient>
{
  private readonly subscribers: Set<UUID> = new Set()

  // Delay before a subscription begins fetching schedule data and registering
  // metrics. Connections that drop within this window cost nothing, which
  // protects against clients that rapidly connect and disconnect in a loop
  private readonly subscribeGracePeriodMs = env.duration(
    "SCHEDULE_SUBSCRIBE_GRACE_PERIOD",
    ms("1s"),
  )

  @WebSocketServer()
  private readonly server!: WsServer

  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly metricsService: ScheduleMetricsService,
    @InjectPinoLogger(ScheduleGateway.name)
    private readonly logger: PinoLogger,
  ) {}

  get connectionCount(): number {
    if (!this.server) {
      return 0
    }

    let count = 0
    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
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
      if (client.readyState !== WebSocket.OPEN) {
        continue
      }
      client.close(code)
      closed++
    }
    return closed
  }

  handleConnection(client: ConnectedClient, request: IncomingMessage) {
    client.connectedAt = performance.now()
    client.sessionId = randomUUID()
    client.ipAddress = proxyAddr(request, (_, i) => i < 2)
    client.headers = request.headers
    client.requestUrl = request.url
    client.versions = parseClientVersions(request.headers["user-agent"] ?? "")

    const deviceId = request.headers["x-device-id"]
    if (deviceId) {
      client.deviceId = Array.isArray(deviceId) ? deviceId[0] : deviceId
    }

    client.logStore = this.createLogStore(client)
    client.sentryScope = createConnectionScope(client)

    this.metricsService.recordDeviceConnection(client.versions, 1)

    client.on("error", (err) => {
      this.logInClientStore(client, () =>
        this.logger.warn({ err }, "WebSocket client error"),
      )
    })

    this.logInClientStore(client, () =>
      this.logger.debug(
        {
          headers: request.headers,
          requestUrl: client.requestUrl,
          versions: client.versions,
        },
        "Client connected",
      ),
    )
  }

  private createLogStore(client: ConnectedClient): Store {
    const bindings: Record<string, string> = {
      ipAddress: client.ipAddress,
      sessionId: client.sessionId,
    }

    if (client.deviceId) {
      bindings.deviceId = client.deviceId
    }

    return new Store(this.logger.logger.child(bindings))
  }

  private logInClientStore(client: ConnectedClient, log: () => void) {
    if (client.logStore) {
      storage.run(client.logStore, log)
    } else {
      log()
    }
  }

  handleDisconnect(client: ConnectedClient) {
    const closeCode = (client as { _closeCode?: number })._closeCode
    const sessionDurationSeconds =
      (performance.now() - client.connectedAt) / 1000

    // ugly hack... :(
    this.logInClientStore(client, () => {
      this.logger.debug(
        { closeCode, sessionDurationSeconds },
        "Client disconnected",
      )

      if (closeCode === 1006) {
        this.logger.warn(
          { closeCode },
          "Client disconnected unexpectedly (code 1006)",
        )
      }
    })

    this.metricsService.recordDeviceConnection(client.versions, -1)
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage("schedule:subscribe")
  subscribeToSchedule(
    @MessageBody() dto: ScheduleSubscriptionDto,
    @ConnectedSocket() socket: ConnectedClient,
  ): Observable<WsResponse<ScheduleUpdate | null>> {
    if (this.subscribers.has(socket.sessionId)) {
      throw new BadRequestException(
        "Only one schedule subscription per connection allowed",
      )
    }

    const routeStopPairs = this.scheduleService.parseRouteStopPairs(
      dto.routeStopPairs,
    )

    if (routeStopPairs.length > 25) {
      throw new BadRequestException("Too many route-stop pairs; maximum 25")
    }

    this.subscribers.add(socket.sessionId)

    const subscription = this.buildScheduleOptions(dto, routeStopPairs)
    const schedule$ = this.scheduleService.subscribeToSchedule(
      subscription,
      socket.sentryScope,
    )

    const scheduleUpdates$ = timer(this.subscribeGracePeriodMs).pipe(
      switchMap(() =>
        schedule$.pipe(
          retry({
            delay: (err, retryCount) =>
              this.handleSubscriptionError(
                socket,
                subscription,
                err,
                retryCount,
              ),
          }),
        ),
      ),
      map((update) => ({ event: "schedule", data: update })),
      finalize(() => this.subscribers.delete(socket.sessionId)),
    )

    const heartbeat$ = interval(ms("30s")).pipe(
      startWith(0),
      map(() => ({ event: "heartbeat", data: null })),
    )

    return merge(scheduleUpdates$, heartbeat$)
  }

  private buildScheduleOptions(
    dto: ScheduleSubscriptionDto,
    routes: RouteAtStopWithOffset[],
  ): ScheduleOptions {
    return {
      feedCode: dto.feedCode || undefined,
      routes,
      limit: dto.limit,
      sortByDeparture: dto.sortByDeparture,
      listMode: dto.listMode,
    }
  }

  private handleSubscriptionError(
    socket: ConnectedClient,
    subscription: ScheduleOptions,
    err: Error,
    retryCount: number,
  ): Observable<0> {
    this.logger.warn(
      { err, subscription, retryCount },
      "Error in schedule subscription",
    )

    // not fatal, but log for troubleshooting and visibility into bad client behavior
    const level: Sentry.SeverityLevel =
      err instanceof DomainError &&
      ["notFound", "invalidInput"].includes(err.kind)
        ? "warning"
        : "error"

    captureWsException(socket, err, {
      level,
      extra: { subscription: JSON.stringify(subscription), retryCount },
    })

    return timer(ms("10s")) as Observable<0>
  }
}
