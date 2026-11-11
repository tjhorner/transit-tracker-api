import { INestApplication } from "@nestjs/common"
import { WsAdapter } from "@nestjs/platform-ws"
import { Test } from "@nestjs/testing"
import { getLoggerToken, PinoLogger } from "nestjs-pino"
import { AddressInfo } from "net"
import { ScheduleMetricsService } from "src/schedule/schedule-metrics.service"
import {
  MAX_MESSAGE_BYTES,
  MAX_ROUTE_STOP_PAIRS_LENGTH,
  ScheduleGateway,
} from "src/schedule/schedule.gateway"
import { ScheduleService } from "src/schedule/schedule.service"
import { mock, mockDeep, MockProxy } from "vitest-mock-extended"
import { WebSocket } from "ws"

describe("ScheduleGateway message limits", () => {
  let app: INestApplication
  let mockScheduleService: MockProxy<ScheduleService>
  let client: WebSocket

  beforeEach(async () => {
    mockScheduleService = mock<ScheduleService>()

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleGateway,
        { provide: ScheduleService, useValue: mockScheduleService },
        {
          provide: ScheduleMetricsService,
          useValue: mock<ScheduleMetricsService>(),
        },
        {
          provide: getLoggerToken(ScheduleGateway.name),
          useValue: mockDeep<PinoLogger>(),
        },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    await app.listen(0, "127.0.0.1")

    const { port } = app.getHttpServer().address() as AddressInfo
    client = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise((resolve) => client.once("open", resolve))
  })

  afterEach(async () => {
    client.terminate()
    await app.close()
  })

  function subscribeMessage(data: Record<string, unknown>): string {
    return JSON.stringify({ event: "schedule:subscribe", data })
  }

  function nextMessage(): Promise<Record<string, unknown>> {
    return new Promise((resolve) =>
      client.once("message", (message) =>
        resolve(JSON.parse(message.toString())),
      ),
    )
  }

  function nextCloseCode(): Promise<number> {
    return new Promise((resolve) => client.once("close", resolve))
  }

  it("closes the connection when a message exceeds the payload limit", async () => {
    const closeCode = nextCloseCode()

    client.send(
      subscribeMessage({
        routeStopPairs: "a".repeat(MAX_MESSAGE_BYTES),
        limit: 1,
      }),
    )

    // 1009 = Message Too Big
    expect(await closeCode).toBe(1009)
    expect(mockScheduleService.parseRouteStopPairs).not.toHaveBeenCalled()
  })

  it("rejects routeStopPairs longer than the maximum length", async () => {
    const response = nextMessage()

    client.send(
      subscribeMessage({
        routeStopPairs: "a".repeat(MAX_ROUTE_STOP_PAIRS_LENGTH + 1),
        limit: 1,
      }),
    )

    expect(await response).toMatchObject({ kind: "invalidInput" })
    expect(mockScheduleService.parseRouteStopPairs).not.toHaveBeenCalled()
  })

  it.each([
    ["a number", 5],
    ["an array", ["route,stop"]],
    ["an object", { route: "stop" }],
  ])("rejects routeStopPairs given as %s", async (_, routeStopPairs) => {
    const response = nextMessage()

    client.send(subscribeMessage({ routeStopPairs, limit: 1 }))

    expect(await response).toMatchObject({ kind: "invalidInput" })
    expect(mockScheduleService.parseRouteStopPairs).not.toHaveBeenCalled()
    expect(client.readyState).toBe(WebSocket.OPEN)
  })
})
