import * as turf from "@turf/turf"
import { BBox } from "geojson"
import { AllFeedsService } from "src/modules/feed/all-feeds.service"
import { FeedService } from "src/modules/feed/feed.service"
import {
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { mock, MockProxy } from "vitest-mock-extended"

describe("AllFeedsService", () => {
  let allFeedsService: AllFeedsService
  let mockFeedService: MockProxy<FeedService>
  let mockFeedProvider1: MockProxy<FeedProvider>
  let mockFeedProvider2: MockProxy<FeedProvider>

  const mockFeedProviders: Record<string, MockProxy<FeedProvider>> = {}

  beforeEach(() => {
    mockFeedProvider1 = mock<FeedProvider>()
    mockFeedProvider2 = mock<FeedProvider>()
    mockFeedProviders["feed1"] = mockFeedProvider1
    mockFeedProviders["feed2"] = mockFeedProvider2

    mockFeedService = mock<FeedService>()
    mockFeedService.getFeedProvider.mockImplementation(
      (feedCode: string) => mockFeedProviders[feedCode],
    )
    mockFeedService.getAllFeedProviders.mockReturnValue(mockFeedProviders)
    mockFeedService.getFeedProvidersInBounds.mockResolvedValue([
      { feedCode: "feed1", provider: mockFeedProvider1 },
      { feedCode: "feed2", provider: mockFeedProvider2 },
    ])
    mockFeedService.getServiceArea.mockImplementation(
      async (feedCode: string) =>
        mockFeedProviders[feedCode]?.getAgencyBounds
          ? turf.bboxPolygon(
              await mockFeedProviders[feedCode].getAgencyBounds(),
            )
          : Promise.resolve(turf.bboxPolygon([-180, -90, 180, 90])),
    )

    allFeedsService = new AllFeedsService(mockFeedService)
  })

  describe("healthCheck", () => {
    it("should resolve without error", async () => {
      await expect(allFeedsService.healthCheck()).resolves.toBeUndefined()
    })
  })

  describe("getUpcomingTripsForRoutesAtStops", () => {
    it("should throw error when route and stop have different feed codes", async () => {
      // Arrange
      const routeStops: RouteAtStop[] = [
        { routeId: "feed1:route1", stopId: "feed2:stop1" },
      ]

      // Act & Assert
      await expect(
        allFeedsService.getUpcomingTripsForRoutesAtStops(routeStops),
      ).rejects.toThrow("Route and stop IDs must have the same feed code")
    })

    it("should throw error for invalid feed code", async () => {
      // Arrange
      const routeStops: RouteAtStop[] = [
        { routeId: "invalidFeed:route1", stopId: "invalidFeed:stop1" },
      ]

      mockFeedService.getFeedProvider.mockReturnValue(undefined)

      // Act & Assert
      await expect(
        allFeedsService.getUpcomingTripsForRoutesAtStops(routeStops),
      ).rejects.toThrow("No provider found for feed code")
    })

    it("should correctly delegate to feed providers and return combined results", async () => {
      // Arrange
      const routeStops: RouteAtStop[] = [
        { routeId: "feed1:route1", stopId: "feed1:stop1" },
        { routeId: "feed2:route2", stopId: "feed2:stop2" },
      ]

      const feed1Trips: TripStop[] = [
        {
          tripId: "trip1",
          routeId: "route1",
          stopId: "stop1",
          routeName: "Route 1",
          routeColor: "FF0000",
          headsign: "Destination 1",
          stopName: "Stop 1",
          arrivalTime: new Date(),
          departureTime: new Date(),
          vehicle: null,
          isRealtime: true,
        },
      ]

      const feed2Trips: TripStop[] = [
        {
          tripId: "trip2",
          routeId: "route2",
          stopId: "stop2",
          routeName: "Route 2",
          routeColor: "00FF00",
          headsign: "Destination 2",
          stopName: "Stop 2",
          arrivalTime: new Date(),
          departureTime: new Date(),
          vehicle: null,
          isRealtime: false,
        },
      ]

      mockFeedProvider1.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        feed1Trips,
      )
      mockFeedProvider2.getUpcomingTripsForRoutesAtStops.mockResolvedValue(
        feed2Trips,
      )

      // Act
      const result =
        await allFeedsService.getUpcomingTripsForRoutesAtStops(routeStops)

      // Assert
      expect(
        mockFeedProvider1.getUpcomingTripsForRoutesAtStops,
      ).toHaveBeenCalledWith([{ routeId: "route1", stopId: "stop1" }])
      expect(
        mockFeedProvider2.getUpcomingTripsForRoutesAtStops,
      ).toHaveBeenCalledWith([{ routeId: "route2", stopId: "stop2" }])

      expect(result).toHaveLength(2)
      expect(result[0].tripId).toBe("feed1:trip1")
      expect(result[0].routeId).toBe("feed1:route1")
      expect(result[0].stopId).toBe("feed1:stop1")
      expect(result[1].tripId).toBe("feed2:trip2")
      expect(result[1].routeId).toBe("feed2:route2")
      expect(result[1].stopId).toBe("feed2:stop2")
    })
  })

  describe("getStop", () => {
    it("should delegate to the correct feed provider and return formatted result", async () => {
      // Arrange
      const stopId = "feed1:stop123"
      const stop: Stop = {
        stopId: "stop123",
        stopCode: "S123",
        name: "Test Stop",
        lat: 37.7749,
        lon: -122.4194,
      }

      mockFeedProvider1.getStop.mockResolvedValue(stop)

      // Act
      const result = await allFeedsService.getStop(stopId)

      // Assert
      expect(mockFeedProvider1.getStop).toHaveBeenCalledWith("stop123")
      expect(result).toEqual({
        ...stop,
        stopId: "feed1:stop123",
      })
    })

    it("should throw error for invalid global ID format", async () => {
      // Arrange
      const invalidStopId = "invalidStopId"

      // Act & Assert
      await expect(allFeedsService.getStop(invalidStopId)).rejects.toThrow()
    })
  })

  describe("getRoutesForStop", () => {
    it("should delegate to the correct feed provider and format route IDs", async () => {
      // Arrange
      const stopId = "feed1:stop123"
      const routes: StopRoute[] = [
        {
          routeId: "route1",
          name: "Route 1",
          color: "FF0000",
          headsigns: ["Destination 1", "Destination 2"],
        },
        {
          routeId: "route2",
          name: "Route 2",
          color: "00FF00",
          headsigns: ["Destination 3"],
        },
      ]

      mockFeedProvider1.getRoutesForStop.mockResolvedValue(routes)

      // Act
      const result = await allFeedsService.getRoutesForStop(stopId)

      // Assert
      expect(mockFeedProvider1.getRoutesForStop).toHaveBeenCalledWith("stop123")
      expect(result).toHaveLength(2)
      expect(result[0].routeId).toBe("feed1:route1")
      expect(result[1].routeId).toBe("feed1:route2")
    })
  })

  describe("getStopsInArea", () => {
    it("should retrieve stops from all providers in bounds and add feed code to IDs", async () => {
      // Arrange
      const bbox: BBox = [-123, 37, -122, 38]

      const feed1Stops: Stop[] = [
        {
          stopId: "stop1",
          stopCode: "S1",
          name: "Stop 1",
          lat: 37.5,
          lon: -122.5,
        },
      ]

      const feed2Stops: Stop[] = [
        {
          stopId: "stop2",
          stopCode: "S2",
          name: "Stop 2",
          lat: 37.6,
          lon: -122.6,
        },
      ]

      mockFeedProvider1.getStopsInArea.mockResolvedValue(feed1Stops)
      mockFeedProvider2.getStopsInArea.mockResolvedValue(feed2Stops)

      // Act
      const result = await allFeedsService.getStopsInArea(bbox)

      // Assert
      expect(mockFeedService.getFeedProvidersInBounds).toHaveBeenCalledWith(
        bbox,
      )
      expect(mockFeedProvider1.getStopsInArea).toHaveBeenCalledWith(bbox)
      expect(mockFeedProvider2.getStopsInArea).toHaveBeenCalledWith(bbox)

      expect(result).toHaveLength(2)
      expect(result[0].stopId).toBe("feed1:stop1")
      expect(result[1].stopId).toBe("feed2:stop2")
    })
  })

  describe("getAgencyBounds", () => {
    it("should combine bounds from all feed providers", async () => {
      // Arrange
      const bbox1: BBox = [-123, 37, -122, 38]
      const bbox2: BBox = [-124, 36, -121, 39]

      mockFeedProvider1.getAgencyBounds = vi.fn().mockResolvedValue(bbox1)
      mockFeedProvider2.getAgencyBounds = vi.fn().mockResolvedValue(bbox2)

      // Act
      const result = await allFeedsService.getAgencyBounds()

      // Assert
      expect(mockFeedProvider1.getAgencyBounds).toHaveBeenCalled()
      expect(mockFeedProvider2.getAgencyBounds).toHaveBeenCalled()

      // Result should be the combination of both bounding boxes
      expect(result).toEqual(expect.arrayContaining([-124, 36, -121, 39]))
    })
  })
})
