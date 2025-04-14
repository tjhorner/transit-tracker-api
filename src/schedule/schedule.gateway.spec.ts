import { BadRequestException } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import { randomUUID } from "crypto"
import { mock, MockProxy } from "jest-mock-extended"
import ms from "ms"
import { firstValueFrom, Observable, of } from "rxjs"
import { ScheduleGateway, ScheduleSubscriptionDto } from "./schedule.gateway"
import { ScheduleService, ScheduleUpdate } from "./schedule.service"

// Mock the WebSocket exception filters
jest.mock("src/filters/ws-exception.filter", () => ({
  WebSocketExceptionFilter: jest.fn(),
  WebSocketHttpExceptionFilter: jest.fn(),
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
    jest.clearAllMocks()
  })

  afterEach(async () => {
    await moduleRef.close()
  })

  function makeMockClient() {
    const clientId = randomUUID()
    const mockClient = { id: clientId } as any
    return { mockClient, clientId }
  }

  describe("handleConnection", () => {
    it("should assign a UUID to the client", () => {
      // Arrange
      const mockClient = { id: undefined } as any

      // Act
      gateway.handleConnection(mockClient)

      // Assert
      expect(mockClient.id).toBeDefined()
      expect(typeof mockClient.id).toBe("string")
    })
  })

  describe("subscribeToSchedule", () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
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
      dto.routeStopPairs =
        "route1,stop1;route2,stop2;route3,stop3;route4,stop4;route5,stop5;route6,stop6"

      // Mock the parseRouteStopPairs method to return 6 pairs
      mockScheduleService.parseRouteStopPairs.mockReturnValue([
        { routeId: "route1", stopId: "stop1", offset: 0 },
        { routeId: "route2", stopId: "stop2", offset: 0 },
        { routeId: "route3", stopId: "stop3", offset: 0 },
        { routeId: "route4", stopId: "stop4", offset: 0 },
        { routeId: "route5", stopId: "stop5", offset: 0 },
        { routeId: "route6", stopId: "stop6", offset: 0 },
      ])

      // Act & Assert
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        BadRequestException,
      )
      expect(() => gateway.subscribeToSchedule(dto, mockClient)).toThrow(
        "Too many route-stop pairs; maximum 5",
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

      // Trigger subscription and wait for it to complete
      await firstValueFrom(result$)

      // Assert
      // Check that client was removed from subscribers after observable completes
      const subscribers = gateway["subscribers"] as Set<string>
      expect(subscribers.has(clientId)).toBe(false)
    })

    it("should emit schedule updates and then heartbeat signals at 30 second intervals", async () => {
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

      // Initial schedule event
      expect(emittedEvents.length).toBe(1)
      expect(emittedEvents[0]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate,
      })

      // Advance time to trigger heartbeat
      await jest.advanceTimersByTimeAsync(30000)

      // Should have heartbeat event
      expect(emittedEvents.length).toBe(2)
      expect(emittedEvents[1]).toEqual({
        event: "heartbeat",
        data: null,
      })

      // Advance time again
      await jest.advanceTimersByTimeAsync(30000)

      // Should have another heartbeat
      expect(emittedEvents.length).toBe(3)
      expect(emittedEvents[2]).toEqual({
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

      // Initial schedule event should be emitted immediately
      expect(emittedEvents.length).toBe(1)
      expect(emittedEvents[0]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate1,
      })

      // Advance time to trigger the scheduled update
      await jest.advanceTimersByTimeAsync(ms("15s"))

      // Should have a new schedule event
      expect(emittedEvents.length).toBe(2)
      expect(emittedEvents[1]).toEqual({
        event: "schedule",
        data: mockScheduleUpdate2,
      })

      // Advance time to trigger heartbeat (15 more seconds = 30 total)
      await jest.advanceTimersByTimeAsync(ms("15s"))

      // Should have heartbeat event
      expect(emittedEvents.length).toBe(3)
      expect(emittedEvents[2]).toEqual({
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
      const result$ = gateway.subscribeToSchedule(dto, mockClient)

      // Get the first emitted value
      const firstEvent = await firstValueFrom(result$)

      // Assert
      expect(firstEvent).toEqual({
        event: "schedule",
        data: mockScheduleUpdate,
      })
    })
  })
})
