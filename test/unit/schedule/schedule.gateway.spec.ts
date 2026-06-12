import { BadRequestException } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import { randomUUID } from "crypto"
import { IncomingMessage } from "http"
import ms from "ms"
import { Socket } from "net"
import { Observable, of } from "rxjs"
import {
  ScheduleGateway,
  ScheduleSubscriptionDto,
} from "src/schedule/schedule.gateway"
import {
  RouteAtStopWithOffset,
  ScheduleService,
  ScheduleUpdate,
} from "src/schedule/schedule.service"
import { vi } from "vitest"
import { mock, MockProxy } from "vitest-mock-extended"
import { WebSocket } from "ws"

// Mock the WebSocket exception filters
vi.mock("src/filters/ws-exception.filter", () => ({
  WebSocketExceptionFilter: vi.fn(),
  WebSocketHttpExceptionFilter: vi.fn(),
  WebSocketDomainExceptionFilter: vi.fn(),
}))

describe("ScheduleGateway", () => {
  let gateway: ScheduleGateway
  let mockScheduleService: MockProxy<ScheduleService>
  let moduleRef: TestingModule

  beforeEach(async () => {
    mockScheduleService = mock<ScheduleService>()

    moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleGateway,
        {
          provide: ScheduleService,
          useValue: mockScheduleService,
        },
      ],
    }).compile()

    gateway = moduleRef.get<ScheduleGateway>(ScheduleGateway)

    // Reset mocks
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  function makeMockClient() {
    const clientId = randomUUID()
    const mockClient = { id: clientId } as any
    return { mockClient, clientId }
  }

  function waitForGracePeriod() {
    return vi.advanceTimersByTimeAsync(1000)
  }

  describe("handleConnection", () => {
    it("should assign a UUID to the client", () => {
      // Arrange
      const mockClient = mock<WebSocket>() as any

      // Act
      gateway.handleConnection(mockClient, mock<IncomingMessage>())

      // Assert
      expect(mockClient.id).toBeDefined()
      expect(typeof mockClient.id).toBe("string")
    })

    it("should add the ipAddress based on socket IP if not proxied", () => {
      // Arrange
      const mockClient = mock<WebSocket>() as any
      const mockRequest = mock<IncomingMessage>()
      const mockSocket = mock<Socket>()

      // @ts-expect-error - assigning read-only property for testing
      mockSocket.remoteAddress = "1.1.1.1"
      mockRequest.socket = mockSocket

      // Act
      gateway.handleConnection(mockClient, mockRequest)

      // Assert
      expect(mockClient.ipAddress).toBe("1.1.1.1")
    })

    it("should add the ipAddress based on x-forwarded-for header", () => {
      // Arrange
      const mockClient = mock<WebSocket>() as any
      const mockRequest = mock<IncomingMessage>()
      mockRequest.headers["x-forwarded-for"] =
        "1.1.1.1, 2.2.2.2, 3.3.3.3, 4.4.4.4"

      // Act
      gateway.handleConnection(mockClient, mockRequest)

      // Assert
      expect(mockClient.ipAddress).toBe("3.3.3.3")
    })
  })

  describe("connectionCount / shedConnections", () => {
    const openClient = () => ({ readyState: WebSocket.OPEN, close: vi.fn() })
    const closingClient = () => ({
      readyState: WebSocket.CLOSING,
      close: vi.fn(),
    })
    const closedClient = () => ({
      readyState: WebSocket.CLOSED,
      close: vi.fn(),
    })

    function setClients(clients: unknown[]) {
      Object.defineProperty(gateway, "server", {
        value: { clients: new Set(clients) },
        writable: true,
        configurable: true,
      })
    }

    it("counts only open clients", () => {
      // Arrange
      setClients([openClient(), openClient(), closingClient()])

      // Act
      const count = gateway.connectionCount

      // Assert
      expect(count).toBe(2)
    })

    it("returns 0 when no server is attached", () => {
      // Arrange (no server set)

      // Act & Assert
      expect(gateway.connectionCount).toBe(0)
    })

    it("closes up to the target number of open clients and returns the count", () => {
      // Arrange
      const clients = [openClient(), openClient(), openClient()]
      setClients(clients)

      // Act
      const closed = gateway.shedConnections(2, 1001)

      // Assert
      expect(closed).toBe(2)
      expect(clients[0].close).toHaveBeenCalledWith(1001)
      expect(clients[1].close).toHaveBeenCalledWith(1001)
      expect(clients[2].close).not.toHaveBeenCalled()
    })

    it("skips clients that are not open", () => {
      // Arrange
      const closed = closedClient()
      const open = openClient()
      setClients([closed, open])

      // Act
      const count = gateway.shedConnections(5, 1001)

      // Assert
      expect(count).toBe(1)
      expect(closed.close).not.toHaveBeenCalled()
      expect(open.close).toHaveBeenCalledWith(1001)
    })

    it("closes nothing when the target is not positive", () => {
      // Arrange
      const client = openClient()
      setClients([client])

      // Act
      const count = gateway.shedConnections(0, 1001)

      // Assert
      expect(count).toBe(0)
      expect(client.close).not.toHaveBeenCalled()
    })
  })

  describe("subscribeToSchedule", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("should throw if client already has a subscription", () => {
      // Arrange
      const { mockClient, clientId } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()

      // Set up subscriber list to already contain the client ID
      const subscribersSet = new Set<string>([clientId])
      // Use private property access to set the subscribers
      Object.defineProperty(gateway, "subscribers", {
        value: subscribersSet,
        writable: true,
      })

      // Act & Assert
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        BadRequestException,
      )
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        "Only one schedule subscription per connection allowed",
      )
    })

    it("should throw if too many route-stop pairs are provided", () => {
      // Arrange
      const { mockClient } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = ""

      const pairs: RouteAtStopWithOffset[] = []
      for (let i = 1; i <= 26; i++) {
        dto.routeStopPairs += `route${i},stop${i}`
        if (i < 26) {
          dto.routeStopPairs += ";"
        }

        pairs.push({ routeId: `route${i}`, stopId: `stop${i}`, offset: 0 })
      }

      // Mock the parseRouteStopPairs method to return 26 pairs
      mockScheduleService.parseRouteStopPairs.mockReturnValue(pairs)

      // Act & Assert
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        BadRequestException,
      )
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        "Too many route-stop pairs; maximum 25",
      )
    })

    it("should convert empty string feedCode to undefined", () => {
      // Arrange
      const { mockClient } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1"
      dto.feedCode = ""
      dto.limit = 5

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
      ])

      const mockScheduleUpdate: ScheduleUpdate = { trips: [] }
      mockScheduleService.subscribeToSchedule.mockReturnValue(
        of(mockScheduleUpdate),
      )

      // Act
      gateway.subscribeToSchedule(dto, mockClient)

      // Assert
      expect(mockScheduleService.subscribeToSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          feedCode: undefined,
        }),
      )
    })

    it("should add client to subscribers and create schedule subscription", () => {
      // Arrange
      const { mockClient, clientId } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1;route2,stop2"
      dto.limit = 5
      dto.sortByDeparture = true
      dto.listMode = "sequential"

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
        { routeId: "route2", stopId: "stop2", offset: 0 },
      ])

      const mockScheduleUpdate: ScheduleUpdate = { trips: [] }
      mockScheduleService.subscribeToSchedule.mockReturnValue(
        of(mockScheduleUpdate),
      )

      // Act
      gateway.subscribeToSchedule(dto, mockClient)

      // Assert
      expect(mockScheduleService.parseRouteStopPairs).toHaveBeenCalledWith(
        "route1,stop1;route2,stop2",
      )

      expect(mockScheduleService.subscribeToSchedule).toHaveBeenCalledWith({
        feedCode: undefined,
        routes: [
          { routeId: "route1", stopId: "stop1", offset: 0 },
          { routeId: "route2", stopId: "stop2", offset: 0 },
        ],
        limit: 5,
        sortByDeparture: true,
        listMode: "sequential",
      })

      // Check that client is added to subscribers
      const subscribers = gateway["subscribers"] as Set<string>
      expect(subscribers.has(clientId)).toBe(true)
    })

    it("should remove client from subscribers when subscription finalizes", async () => {
      // Arrange
      const { mockClient, clientId } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1"
      dto.limit = 5

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
      ])

      const mockScheduleUpdate: ScheduleUpdate = { trips: [] }
      const scheduleMock$ = of(mockScheduleUpdate)
      mockScheduleService.subscribeToSchedule.mockReturnValue(scheduleMock$)

      // Act
      const result$ = gateway.subscribeToSchedule(dto, mockClient)
      const subscription = result$.subscribe()

      // The schedule observable completes once the grace period passes, which
      // finalizes the schedule branch and removes the client.
      await waitForGracePeriod()

      // Assert
      const subscribers = gateway["subscribers"] as Set<string>
      expect(subscribers.has(clientId)).toBe(false)

      subscription.unsubscribe()
    })

    it("should emit an immediate heartbeat, then the schedule update, then heartbeats every 30 seconds", async () => {
      // Arrange
      const { mockClient } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1"
      dto.limit = 5

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
      ])

      const mockScheduleUpdate: ScheduleUpdate = { trips: [] }
      mockScheduleService.subscribeToSchedule.mockReturnValue(
        of(mockScheduleUpdate),
      )

      // Set up collector for events
      const emittedEvents: any[] = []

      // Act
      const result$ = gateway.subscribeToSchedule(dto, mockClient)
      const subscription = result$.subscribe((event) => {
        emittedEvents.push(event)
      })

      // Immediate heartbeat on connect
      expect(emittedEvents.length).toBe(1)
      expect(emittedEvents[0]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // Schedule event after the grace period
      await waitForGracePeriod()

      expect(emittedEvents.length).toBe(2)
      expect(emittedEvents[1]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate,
      })

      // Advance time to trigger heartbeat
      await vi.advanceTimersByTimeAsync(30000)

      // Should have heartbeat event
      expect(emittedEvents.length).toBe(3)
      expect(emittedEvents[2]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // Advance time again
      await vi.advanceTimersByTimeAsync(30000)

      // Should have another heartbeat
      expect(emittedEvents.length).toBe(4)
      expect(emittedEvents[3]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // Clean up
      subscription.unsubscribe()
    })

    it("should emit both schedule updates and heartbeats when schedules change", async () => {
      // Arrange
      const { mockClient } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1"
      dto.limit = 5

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
      ])

      const mockScheduleUpdate1: ScheduleUpdate = {
        trips: [
          {
            tripId: "trip1",
            routeId: "route1",
            routeName: "Route 1",
            routeColor: "#000000",
            stopId: "stop1",
            stopName: "Stop 1",
            headsign: "Destination",
            arrivalTime: Date.now() / 1000 + 300,
            departureTime: Date.now() / 1000 + 330,
            isRealtime: false,
            directionId: null,
          },
        ],
      }

      const mockScheduleUpdate2: ScheduleUpdate = {
        trips: [
          {
            tripId: "trip2",
            routeId: "route1",
            routeName: "Route 1",
            routeColor: "#000000",
            stopId: "stop1",
            stopName: "Stop 1",
            headsign: "Destination",
            arrivalTime: Date.now() / 1000 + 600,
            departureTime: Date.now() / 1000 + 630,
            isRealtime: false,
            directionId: null,
          },
        ],
      }

      // Set up collector for events
      const emittedEvents: any[] = []

      // Create a mock Observable that will emit two updates (initial + one change)
      // and work with the timer in our test
      const mockObservable = new Observable<ScheduleUpdate>((subscriber) => {
        // Initial value
        subscriber.next(mockScheduleUpdate1)

        // Set up a timer for the second value
        const timer = setTimeout(() => {
          subscriber.next(mockScheduleUpdate2)
        }, ms("15s"))

        // Clean up
        return () => {
          clearTimeout(timer)
        }
      })

      mockScheduleService.subscribeToSchedule.mockReturnValue(mockObservable)

      // Act
      const result$ = gateway.subscribeToSchedule(dto, mockClient)
      const subscription = result$.subscribe((event) => {
        emittedEvents.push(event)
      })

      // Immediate heartbeat on connect
      expect(emittedEvents.length).toBe(1)
      expect(emittedEvents[0]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // First schedule event after the grace period
      await waitForGracePeriod()

      expect(emittedEvents.length).toBe(2)
      expect(emittedEvents[1]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate1,
      })

      // Advance time to trigger the scheduled update
      await vi.advanceTimersByTimeAsync(ms("15s"))

      // Should have a new schedule event
      expect(emittedEvents.length).toBe(3)
      expect(emittedEvents[2]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate2,
      })

      // Advance time to trigger heartbeat (15 more seconds = 30 total)
      await vi.advanceTimersByTimeAsync(ms("15s"))

      // Should have heartbeat event
      expect(emittedEvents.length).toBe(4)
      expect(emittedEvents[3]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // Clean up
      subscription.unsubscribe()
    })

    it("should merge schedule updates with heartbeat signals", async () => {
      // Arrange
      const { mockClient } = makeMockClient()
      const dto = new ScheduleSubscriptionDto()
      dto.routeStopPairs = "route1,stop1"
      dto.limit = 5

      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
      ])

      const mockScheduleUpdate: ScheduleUpdate = { trips: [] }
      mockScheduleService.subscribeToSchedule.mockReturnValue(
        of(mockScheduleUpdate),
      )

      // Act
      const emittedEvents: any[] = []
      const result$ = gateway.subscribeToSchedule(dto, mockClient)
      const subscription = result$.subscribe((event) => {
        emittedEvents.push(event)
      })

      await waitForGracePeriod()

      // Assert: an immediate heartbeat followed by the schedule update
      expect(emittedEvents).toEqual([
        { event: "heartbeat", data: null },
        { event: "schedule", data: mockScheduleUpdate },
      ])

      subscription.unsubscribe()
    })
  })
})
