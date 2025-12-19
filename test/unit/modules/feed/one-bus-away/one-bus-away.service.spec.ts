import { NotFoundException } from "@nestjs/common"
import OnebusawaySDK, { APIError } from "onebusaway-sdk"
import { AgenciesWithCoverageListResponse } from "onebusaway-sdk/resources/agencies-with-coverage.mjs"
import { ArrivalAndDepartureListResponse } from "onebusaway-sdk/resources/arrival-and-departure.mjs"
import {
  FeedContext,
  RouteAtStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import { OneBusAwayConfig } from "src/modules/feed/modules/one-bus-away/config"
import { OneBusAwayService } from "src/modules/feed/modules/one-bus-away/one-bus-away.service"
import { MockInstance } from "vitest"
import { DeepMockProxy, mock, mockDeep, MockProxy } from "vitest-mock-extended"
import fixture_arrivals_and_departures_1_71971 from "./__fixtures__/arrivals_and_departures_1_71971.json"
import fixture_arrivals_and_departures_1_72476 from "./__fixtures__/arrivals_and_departures_1_72476.json"
import fixture_stop_1_71971 from "./__fixtures__/stop_1_71971.json"
import fixture_stops_for_route_1_102704 from "./__fixtures__/stops_for_route_1_102704.json"
import fixture_stops_for_route_1_102752 from "./__fixtures__/stops_for_route_1_102752.json"
import fixture_stops_for_route_1_102753 from "./__fixtures__/stops_for_route_1_102753.json"

const feedContext: FeedContext<OneBusAwayConfig> = {
  feedCode: "test-feed",
  config: {
    baseUrl: "https://api.example.com",
    apiKey: "testApiKey",
  },
}

describe("OneBusAwayService", () => {
  let oneBusAwayService: OneBusAwayService
  let mockCacheService: MockProxy<FeedCacheService>
  let mockObaSdk: DeepMockProxy<OnebusawaySDK>

  beforeEach(() => {
    mockCacheService = mock<FeedCacheService>()
    mockObaSdk = mockDeep<OnebusawaySDK>()

    mockCacheService.cached.mockImplementation(async (_, fn) => {
      const result = await fn()
      if (result instanceof Object && "value" in result && "ttl" in result) {
        return result.value
      }

      return result
    })

    oneBusAwayService = new OneBusAwayService(
      feedContext,
      mockCacheService,
      mockObaSdk,
    )
  })

  it("performs a health check successfully", async () => {
    await oneBusAwayService.healthCheck()
  })

  it("calculates the agency bounds based on agencies with coverage", async () => {
    // Arrange
    mockObaSdk.agenciesWithCoverage.list.mockResolvedValueOnce(
      mockObaResponse<AgenciesWithCoverageListResponse.Data>({
        limitExceeded: false,
        list: [
          {
            agencyId: "1",
            lat: 47.53009,
            latSpan: 0.6819459999999964,
            lon: -122.1462285,
            lonSpan: 0.7207869999999872,
          },
          {
            agencyId: "23",
            lat: 47.613395499999996,
            latSpan: 0.02854099999999704,
            lon: -122.3263055,
            lonSpan: 0.024529000000001133,
          },
        ],
      }),
    )

    // Act
    const bbox = await oneBusAwayService.getAgencyBounds()

    // Assert
    const expectedBBox = [
      -122.506622, 47.189117, -121.78583500000002, 47.871063,
    ]

    expect(bbox).toEqual(expectedBBox)
  })

  describe("getRoutesForStop", () => {
    it("gets the routes and headsigns for a stop", async () => {
      // Arrange
      const stopId = "1_71971"

      mockObaSdk.stop.retrieve.mockResolvedValueOnce(
        mockObaResponse(fixture_stop_1_71971),
      )

      mockObaSdk.stopsForRoute.list.mockImplementation((routeId): any => {
        let resp: any
        if (routeId === "1_102704") {
          resp = mockObaResponse(fixture_stops_for_route_1_102704)
        } else if (routeId === "1_102752") {
          resp = mockObaResponse(fixture_stops_for_route_1_102752)
        } else if (routeId === "1_102753") {
          resp = mockObaResponse(fixture_stops_for_route_1_102753)
        } else {
          return Promise.reject(new Error("Route not found"))
        }

        return Promise.resolve(resp)
      })

      // Act
      const routes = await oneBusAwayService.getRoutesForStop(stopId)

      // Assert
      expect(routes).toEqual([
        {
          routeId: "1_102753",
          name: "222",
          color: "FDB71A",
          headsigns: ["Redmond Technology Station Downtown Redmond Station"],
        },
        {
          routeId: "1_102752",
          name: "223",
          color: "FDB71A",
          headsigns: ["Eastgate P&R Lake Hills"],
        },
        {
          routeId: "1_102704",
          name: "250",
          color: "FDB71A",
          headsigns: ["Bellevue Transit Center Bear Creek P&R"],
        },
      ])
    })

    it("handles 404 errors by throwing a NotFoundException", async () => {
      // Arrange
      const stopId = "1_99999"
      mockObaSdk.stop.retrieve.mockRejectedValueOnce(
        new APIError(404, undefined, "Not Found", undefined),
      )

      // Act
      const act = () => oneBusAwayService.getRoutesForStop(stopId)

      // Assert
      await expect(act).rejects.toThrowError(
        new NotFoundException("Stop 1_99999 not found"),
      )
    })

    it("handles null responses by throwing a NotFoundException", async () => {
      // Arrange
      const stopId = "1_99999"
      mockObaSdk.stop.retrieve.mockResolvedValueOnce(null as any)

      // Act
      const act = () => oneBusAwayService.getRoutesForStop(stopId)

      // Assert
      await expect(act).rejects.toThrowError(
        new NotFoundException("Stop 1_99999 not found"),
      )
    })

    it("handles other errors by throwing InternalServerErrorException", async () => {
      // Arrange
      const stopId = "1_88888"
      mockObaSdk.stop.retrieve.mockRejectedValueOnce(
        new APIError(500, undefined, "Internal Server Error", undefined),
      )

      // Act
      const act = () => oneBusAwayService.getRoutesForStop(stopId)

      // Assert
      await expect(act).rejects.toThrowError(/Internal Server Error/)
    })
  })

  describe("getStop", () => {
    it("gets a stop by its ID", async () => {
      // Arrange
      const stopId = "1_71971"
      mockObaSdk.stop.retrieve.mockResolvedValueOnce(
        mockObaResponse(fixture_stop_1_71971),
      )

      // Act
      const stop = await oneBusAwayService.getStop(stopId)

      // Assert
      expect(stop).toEqual({
        lat: 47.674011,
        lon: -122.13089,
        name: "NE Redmond Way & Bear Creek Pkwy",
        stopCode: "71971",
        stopId: "1_71971",
      })
    })

    it("handles 404 errors by throwing a NotFoundException", async () => {
      // Arrange
      const stopId = "1_99999"
      mockObaSdk.stop.retrieve.mockRejectedValueOnce(
        new APIError(404, undefined, "Not Found", undefined),
      )

      // Act
      const act = () => oneBusAwayService.getStop(stopId)

      // Assert
      await expect(act).rejects.toThrowError(
        new NotFoundException("Stop 1_99999 not found"),
      )
    })

    it("handles other errors by throwing InternalServerErrorException", async () => {
      // Arrange
      const stopId = "1_88888"
      mockObaSdk.stop.retrieve.mockRejectedValueOnce(
        new APIError(500, undefined, "Internal Server Error", undefined),
      )

      // Act
      const act = () => oneBusAwayService.getStop(stopId)

      // Assert
      await expect(act).rejects.toThrowError(/Internal Server Error/)
    })
  })

  describe("getUpcomingTripsForRoutesAtStops", () => {
    let dateSpy: MockInstance<() => any>

    beforeEach(() => {
      dateSpy = vi.spyOn(Date, "now")
      dateSpy.mockImplementation(() =>
        new Date("2025-12-17T04:00:00Z").getTime(),
      )
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    const testRoutesAtStops: RouteAtStop[] = [
      { stopId: "1_71971", routeId: "1_102704" },
      { stopId: "1_71971", routeId: "1_102752" },
      { stopId: "1_72476", routeId: "1_102548" },
    ] as const

    it("gets trips for the correct routes at the correct stops", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes()

      // Assert
      expect(upcomingTrips).toMatchSnapshot()

      for (const trip of upcomingTrips) {
        const matchingRouteAtStop = testRoutesAtStops.find(
          (ras) => ras.routeId === trip.routeId && ras.stopId === trip.stopId,
        )

        expect(matchingRouteAtStop).toBeDefined()
      }
    })

    it.for([" ", " - ", ": "])(
      "removes the route name from the headsign if it is present (using separator '%s')",
      async (separator) => {
        // Arrange & Act
        const upcomingTrips = await getUpcomingTripsForTestRoutes((resp) => {
          for (const ad of resp.data.entry.arrivalsAndDepartures) {
            ad.tripHeadsign = `${ad.routeShortName}${separator}${ad.tripHeadsign}`
          }
          return resp
        })

        // Assert
        for (const trip of upcomingTrips) {
          expect(trip.headsign.startsWith(trip.routeName)).toBe(false)
        }
      },
    )

    it("marks trips with predicted times as real-time and uses the appropriate times", async () => {
      // Arrange & Act
      const predictedTripId = "1_766488949"
      const predictedArrivalTime = 1765945851000
      const predictedDepartureTime = 1765946151000

      const scheduledTripId = "1_721019209"
      const scheduledArrivalTime = 1765945951000
      const scheduledDepartureTime = 1765946251000

      const upcomingTrips = await getUpcomingTripsForTestRoutes((resp) => {
        for (const ad of resp.data.entry.arrivalsAndDepartures) {
          if (ad.tripId === predictedTripId) {
            ad.predicted = true
          }

          if (ad.tripId === scheduledTripId) {
            ad.predicted = false
          }

          if (ad.tripId === predictedTripId || ad.tripId === scheduledTripId) {
            ad.predictedArrivalTime = predictedArrivalTime
            ad.scheduledArrivalTime = scheduledArrivalTime
            ad.predictedDepartureTime = predictedDepartureTime
            ad.scheduledDepartureTime = scheduledDepartureTime
          }
        }

        return resp
      })

      // Assert
      const predictedTrip = upcomingTrips.find(
        (trip) => trip.tripId === predictedTripId,
      )
      const scheduledTrip = upcomingTrips.find(
        (trip) => trip.tripId === scheduledTripId,
      )

      expect(predictedTrip?.isRealtime).toBe(true)
      expect(predictedTrip?.arrivalTime.getTime()).toBe(predictedArrivalTime)
      expect(predictedTrip?.departureTime.getTime()).toBe(
        predictedDepartureTime,
      )

      expect(scheduledTrip?.isRealtime).toBe(false)
      expect(scheduledTrip?.arrivalTime.getTime()).toBe(scheduledArrivalTime)
      expect(scheduledTrip?.departureTime.getTime()).toBe(
        scheduledDepartureTime,
      )
    })

    it("filters out trips which have already departed", async () => {
      // Arrange & Act
      const alreadyDepartedTripId = "1_766488949"

      let foundAlreadyDepartedTrip = false
      const upcomingTrips = await getUpcomingTripsForTestRoutes((resp) => {
        for (const ad of resp.data.entry.arrivalsAndDepartures) {
          if (ad.tripId === alreadyDepartedTripId) {
            foundAlreadyDepartedTrip = true
            ad.predicted = true
            ad.predictedDepartureTime = 1765943940000
            break
          }
        }

        return resp
      })

      // Assert
      expect(foundAlreadyDepartedTrip).toBe(true)

      const alreadyDepartedTrip = upcomingTrips.find(
        (trip) => trip.tripId === alreadyDepartedTripId,
      )
      expect(alreadyDepartedTrip).toBeUndefined()
    })

    it("filters out trips for non-requested routes", async () => {
      // Arrange & Act
      let foundNonRequestedTrip = false
      const upcomingTrips = await getUpcomingTripsForTestRoutes((resp) => {
        for (const ad of resp.data.entry.arrivalsAndDepartures) {
          if (ad.routeId === "1_102753") {
            foundNonRequestedTrip = true
            break
          }
        }

        return resp
      })

      // Assert
      expect(foundNonRequestedTrip).toBe(true)

      const nonRequestedTrip = upcomingTrips.find(
        (trip) => trip.routeId === "1_102753",
      )
      expect(nonRequestedTrip).toBeUndefined()
    })

    it("filters out trips from routes which are requested, but from a different stop", async () => {
      // Arrange & Act
      let foundDifferentStopTrip = false
      const upcomingTrips = await getUpcomingTripsForTestRoutes((resp) => {
        for (const ad of resp.data.entry.arrivalsAndDepartures) {
          if (ad.routeId === "1_102752" && ad.stopId === "1_72476") {
            foundDifferentStopTrip = true
            break
          }
        }

        return resp
      })

      // Assert
      expect(foundDifferentStopTrip).toBe(true)

      const differentStopTrip = upcomingTrips.find(
        (trip) => trip.routeId === "1_102752" && trip.stopId === "1_72476",
      )
      expect(differentStopTrip).toBeUndefined()
    })

    it("requests data for each stop only once even if multiple routes are requested for the same stop", async () => {
      // Arrange & Act
      await getUpcomingTripsForTestRoutes()

      // Assert
      const numberOfTestStops = new Set(
        testRoutesAtStops.map((ras) => ras.stopId),
      ).size

      expect(testRoutesAtStops.length).toBeGreaterThan(numberOfTestStops)
      expect(mockObaSdk.arrivalAndDeparture.list).toHaveBeenCalledTimes(
        numberOfTestStops,
      )
    })

    function getUpcomingTripsForTestRoutes(
      transformResponse?: (resp: ArrivalAndDepartureListResponse) => any,
    ) {
      // Arrange
      mockObaSdk.arrivalAndDeparture.list.mockImplementation((stopId): any => {
        let resp: any
        if (stopId === "1_71971") {
          resp = mockObaResponse(fixture_arrivals_and_departures_1_71971)
        } else if (stopId === "1_72476") {
          resp = mockObaResponse(fixture_arrivals_and_departures_1_72476)
        } else {
          return Promise.reject(new Error("Stop not found"))
        }

        if (transformResponse) {
          resp = transformResponse(structuredClone(resp))
        }

        return Promise.resolve(resp)
      })

      // Act
      return oneBusAwayService.getUpcomingTripsForRoutesAtStops(
        testRoutesAtStops,
      )
    }
  })

  function mockObaResponse<T>(data: Partial<T>) {
    return {
      code: 200,
      currentTime: Date.now(),
      text: "OK",
      version: 2,
      data: data as T,
    }
  }
})
