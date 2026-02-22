import { randomUUID } from "crypto"
import { firstValueFrom, Observable } from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"
import {
  FeedProvider,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { ScheduleMetricsService } from "src/schedule/schedule-metrics.service"
import { ScheduleOptions, ScheduleService } from "src/schedule/schedule.service"
import { vi } from "vitest"
import { mock, MockProxy } from "vitest-mock-extended"

describe("ScheduleService", () => {
  let scheduleService: ScheduleService

  let mockFeedProvider: MockProxy<FeedProvider>
  let mockFeedService: MockProxy<FeedService>
  let mockMetricsService: MockProxy<ScheduleMetricsService>

  beforeEach(() => {
    mockFeedProvider = mock<FeedProvider>()
    mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue([])

    mockMetricsService = mock<ScheduleMetricsService>()

    mockFeedService = mock<FeedService>()
    mockFeedService.getFeedProvider.mockReturnValue(mockFeedProvider)

    scheduleService = new ScheduleService(mockFeedService, mockMetricsService)
  })

  describe("getSchedule", () => {
    it("throws if the feed code is invalid", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "fakeFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      mockFeedService.getFeedProvider.mockReturnValue(undefined)

      // Act
      const act = () => scheduleService.getSchedule(scheduleOptions)

      // Assert
      expect(act).toThrow()
    })

    it("requests the schedule for the correct routes and stops", async () => {
      // Arrange
      const feedCode = "testFeed"
      const scheduleOptions: ScheduleOptions = {
        feedCode,
        routes: [
          { routeId: "route1", stopId: "stop1", offset: 0 },
          { routeId: "route2", stopId: "stop2", offset: 0 },
        ],
        limit: 5,
        sortByDeparture: true,
        listMode: "sequential",
      }

      // Act
      await scheduleService.getSchedule(scheduleOptions)

      // Assert
      expect(mockFeedService.getFeedProvider).toHaveBeenCalledWith(feedCode)
      expect(
        mockFeedProvider.getUpcomingTripsForRoutesAtStops,
      ).toHaveBeenCalledWith([
        expect.objectContaining({ routeId: "route1", stopId: "stop1" }),
        expect.objectContaining({ routeId: "route2", stopId: "stop2" }),
      ])
    })

    it("applies time offsets correctly", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [
          { routeId: "route1", stopId: "stop1", offset: -30 }, // -30 seconds
          { routeId: "route2", stopId: "stop2", offset: -45 }, // -45 seconds
        ],
        limit: 5,
      }

      const mockTripStops = [
        ...makeMockTripStops("route1", "stop1", 1),
        ...makeMockTripStops("route2", "stop2", 1),
      ]

      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        mockTripStops,
      )

      // Act
      const schedule = await scheduleService.getSchedule(scheduleOptions)

      // Assert
      expect(schedule.trips[1].arrivalTime).toEqual(
        (mockTripStops[0].arrivalTime.getTime() - 30000) / 1000,
      )
      expect(schedule.trips[0].arrivalTime).toEqual(
        (mockTripStops[1].arrivalTime.getTime() - 45000) / 1000,
      )
    })

    it("limits the number of trips", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      const mockTripStops = makeMockTripStops("route1", "stop1", 10)
      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        mockTripStops,
      )

      // Act
      const schedule = await scheduleService.getSchedule(scheduleOptions)

      // Assert
      expect(schedule.trips.length).toBe(5)
    })

    it("includes the next trips in sequential order when listMode is sequential", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [
          { routeId: "route1", stopId: "stop1", offset: 0 },
          { routeId: "route2", stopId: "stop2", offset: 0 },
        ],
        limit: 3,
        listMode: "sequential",
      }

      const mockTripStops = [
        ...makeMockTripStops("route1", "stop1", 2),
        ...makeMockTripStops("route2", "stop2", 2),
      ]

      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        mockTripStops,
      )

      // Act
      const schedule = await scheduleService.getSchedule(scheduleOptions)

      // Assert
      const expectedTrips = mockTripStops
        .sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime())
        .slice(0, 3)

      expect(schedule.trips.map((t) => t.tripId)).toEqual(
        expectedTrips.map((t) => t.tripId),
      )
    })

    it("includes only the first trip from each selected route-stop pair when listMode is nextPerRoute", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [
          { routeId: "route1", stopId: "stop1", offset: 0 },
          { routeId: "route2", stopId: "stop2", offset: 0 },
          { routeId: "route2", stopId: "stop3", offset: 0 },
        ],
        limit: 3,
        listMode: "nextPerRoute",
      }

      const mockTripStops = [
        ...makeMockTripStops("route1", "stop1", 2),
        ...makeMockTripStops("route2", "stop2", 2),
        ...makeMockTripStops("route2", "stop3", 2),
      ]

      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        mockTripStops,
      )

      // Act
      const schedule = await scheduleService.getSchedule(scheduleOptions)

      // Assert
      expect(schedule.trips.length).toBe(3)
      expect(schedule.trips[0].routeId).toBe("route1")
      expect(schedule.trips[1].routeId).toBe("route2")
      expect(schedule.trips[2].routeId).toBe("route2")
      expect(schedule.trips[0].stopId).toBe("stop1")
      expect(schedule.trips[1].stopId).toBe("stop2")
      expect(schedule.trips[2].stopId).toBe("stop3")
    })

    it.each([true, false])(
      "filters properly when sortByDeparture = %p",
      async (sortByDeparture) => {
        // Arrange
        const scheduleOptions: ScheduleOptions = {
          feedCode: "testFeed",
          routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
          limit: 5,
          sortByDeparture,
        }

        const mockTripStops = makeMockTripStops("route1", "stop1", 2)

        // First trip arrives in the past but departs in the future
        mockTripStops[0].arrivalTime = new Date(Date.now() - 60000)
        mockTripStops[0].departureTime = new Date(Date.now() + 30000)

        // Second trip both arrives *and* departs in the future
        mockTripStops[1].arrivalTime = new Date(Date.now() + 60000)
        mockTripStops[1].departureTime = new Date(Date.now() + 120000)

        mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
          mockTripStops,
        )

        // Act
        const schedule = await scheduleService.getSchedule(scheduleOptions)

        // Assert
        if (sortByDeparture) {
          // Both trips depart in the future so should be included
          expect(schedule.trips.length).toBe(2)
        } else {
          // Trip arriving in the past should be filtered out
          expect(schedule.trips.length).toBe(1)
          expect(schedule.trips[0].tripId).toBe(mockTripStops[1].tripId)
        }
      },
    )
  })

  describe("subscribeToSchedule", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("throws if the feed code is invalid", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "fakeFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      mockFeedService.getFeedProvider.mockReturnValue(undefined)

      // Act
      const act = () => scheduleService.subscribeToSchedule(scheduleOptions)

      // Assert
      expect(act).toThrow()
    })

    it("emits an error if schedule retrieval fails", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockRejectedValue(
        new Error("whoops"),
      )

      // Act
      const observable = scheduleService.subscribeToSchedule(scheduleOptions)

      // Assert
      await expect(firstValueFrom(observable)).rejects.toBeDefined()
    })

    it("adds and removes subscriptions to the metrics service", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      const observable = scheduleService.subscribeToSchedule(scheduleOptions)

      // Assert (initial state)
      expect(mockMetricsService.add).toHaveBeenCalledTimes(0)
      expect(mockMetricsService.remove).toHaveBeenCalledTimes(0)

      // Act (subscribe)
      const firstSubscription = observable.subscribe()
      const secondSubscription = observable.subscribe()

      // Assert
      expect(mockMetricsService.add).toHaveBeenCalledTimes(1)
      expect(mockMetricsService.remove).toHaveBeenCalledTimes(0)

      // Act (unsubscribe)
      firstSubscription.unsubscribe()
      secondSubscription.unsubscribe()

      // Assert
      expect(mockMetricsService.add).toHaveBeenCalledTimes(1)
      expect(mockMetricsService.remove).toHaveBeenCalledTimes(1)
      expect(mockMetricsService.remove).toHaveBeenCalledWith(
        mockMetricsService.add.mock.calls[0][0],
      )
    })

    it("starts polling only once, even with multiple subscribers", () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      const trips = makeMockTripStops("route1", "stop1", 3)

      // Act
      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(trips)

      const observable = scheduleService.subscribeToSchedule(scheduleOptions)

      const firstSubscription = observable.subscribe()
      const secondSubscription = observable.subscribe()

      firstSubscription.unsubscribe()
      secondSubscription.unsubscribe()

      // Assert
      expect(
        mockFeedProvider.getUpcomingTripsForRoutesAtStops,
      ).toHaveBeenCalledTimes(1)
    })

    it("stops polling when all subscribers have unsubscribed", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      // Act
      const observable = scheduleService.subscribeToSchedule(scheduleOptions)
      observable.subscribe().unsubscribe()

      await vi.advanceTimersByTimeAsync(120000)

      // Assert
      expect(
        mockFeedProvider.getUpcomingTripsForRoutesAtStops,
      ).toHaveBeenCalledTimes(1)
    })

    it("publishes an update when the schedule changes", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      const firstTrips = makeMockTripStops("route1", "stop1", 3)
      const secondTrips = makeMockTripStops("route1", "stop1", 2)

      // Act
      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        firstTrips,
      )

      const finish = collectValues(
        scheduleService.subscribeToSchedule(scheduleOptions),
      )

      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        secondTrips,
      )

      await vi.advanceTimersByTimeAsync(45000)

      const scheduleUpdates = finish()

      // Assert
      expect(scheduleUpdates[0]!.trips.length).toBe(3)
      expect(scheduleUpdates[1]!.trips.length).toBe(2)
    })

    it("does not publish an update if the schedule hasn't changed", async () => {
      // Arrange
      const scheduleOptions: ScheduleOptions = {
        feedCode: "testFeed",
        routes: [{ routeId: "route1", stopId: "stop1", offset: 0 }],
        limit: 5,
      }

      const trips = makeMockTripStops("route1", "stop1", 3)

      // Act
      mockFeedProvider.getUpcomingTripsForRoutesAtStops.mockResolvedValue(trips)

      const finish = collectValues(
        scheduleService.subscribeToSchedule(scheduleOptions),
      )

      await vi.advanceTimersByTimeAsync(45000)

      const scheduleUpdates = finish()

      // Assert
      expect(scheduleUpdates.length).toBe(1)
    })

    function collectValues<T>(observable: Observable<T>): () => T[] {
      const values: T[] = []
      const sub = observable.subscribe((value) => {
        values.push(value)
      })

      return () => {
        sub.unsubscribe()
        return values
      }
    }
  })

  function makeMockTripStops(
    routeId: string,
    stopId: string,
    length: number,
  ): TripStop[] {
    return Array.from({ length }, (_, i) => ({
      tripId: randomUUID(),
      stopId,
      routeId,
      routeName: `Route ${routeId}`,
      routeColor: "#FFFFFF",
      stopName: `Stop ${stopId}`,
      headsign: `Headsign ${i}`,
      arrivalTime: new Date(Date.now() + (i + 1) * 60000),
      departureTime: new Date(Date.now() + (i + 2) * 60000),
      vehicle: null,
      isRealtime: false,
    }))
  }

  describe("parseRouteStopPairs", () => {
    it("should parse route-stop pairs without offset correctly", () => {
      // Arrange
      const input = "route1,stop1;route2,stop2"

      // Act
      const result = scheduleService.parseRouteStopPairs(input)

      // Assert
      expect(result).toEqual([
        { routeId: "route1", stopId: "stop1", offset: 0 },
        { routeId: "route2", stopId: "stop2", offset: 0 },
      ])
    })

    it("should parse route-stop pairs with offset correctly", () => {
      // Arrange
      const input = "route1,stop1,10;route2,stop2,20"

      // Act
      const result = scheduleService.parseRouteStopPairs(input)

      // Assert
      expect(result).toEqual([
        { routeId: "route1", stopId: "stop1", offset: 10 },
        { routeId: "route2", stopId: "stop2", offset: 20 },
      ])
    })

    it("should throw an error for not enough parameters in pair", () => {
      // Arrange
      const input = "route1"

      // Act & Assert
      expect(() => scheduleService.parseRouteStopPairs(input)).toThrow()
    })

    it("should throw an error when offset is not a number", () => {
      // Arrange
      const input = "route1,stop1,notANumber"

      // Act & Assert
      expect(() => scheduleService.parseRouteStopPairs(input)).toThrow()
    })
  })
})
