import ms from "ms"
import {
  FeedContext,
  RouteAtStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import {
  MvgApiClient,
  MvgDeparture,
  MvgStation,
} from "src/modules/feed/modules/mvg/api-client"
import { MvgConfig } from "src/modules/feed/modules/mvg/config"
import { MvgService } from "src/modules/feed/modules/mvg/mvg.service"
import { MockInstance } from "vitest"
import { mock, MockProxy } from "vitest-mock-extended"

const feedContext: FeedContext<MvgConfig> = {
  feedCode: "test-feed",
  config: {
    baseUrl: "https://mvg.example.com/api",
  },
}

const NOW = new Date("2025-12-17T04:00:00Z").getTime()

function makeStation(overrides: Partial<MvgStation> = {}): MvgStation {
  return {
    globalId: "de:09162:70",
    name: "Universität",
    place: "München",
    latitude: 48.150527,
    longitude: 11.581175,
    type: "STATION",
    products: ["UBAHN"],
    tariffZones: "m",
    transportTypes: ["UBAHN"],
    ...overrides,
  }
}

function makeDeparture(overrides: Partial<MvgDeparture> = {}): MvgDeparture {
  return {
    plannedDepartureTime: NOW + ms("5m"),
    realtime: true,
    delayInMinutes: 0,
    realtimeDepartureTime: NOW + ms("5m"),
    transportType: "UBAHN",
    label: "U6",
    divaId: "010",
    network: "swm",
    trainType: "",
    destination: "Klinikum Großhadern",
    cancelled: false,
    sev: false,
    platform: 1,
    platformChanged: false,
    messages: [],
    infos: [],
    bannerHash: "",
    occupancy: "LOW",
    stationGlobalId: "de:09162:70",
    stopPointGlobalId: "de:09162:70:1:1",
    lineId: "swm:02U06",
    tripCode: 123,
    ...overrides,
  }
}

describe("MvgService", () => {
  let mvgService: MvgService
  let mockCacheService: MockProxy<FeedCacheService>
  let mockApiClient: MockProxy<MvgApiClient>
  let rawCacheResults: Map<string, any>

  beforeEach(() => {
    mockCacheService = mock<FeedCacheService>()
    mockApiClient = mock<MvgApiClient>()
    rawCacheResults = new Map()

    mockCacheService.cached.mockImplementation(async (key, fn) => {
      const result = await fn()
      rawCacheResults.set(key, result)
      if (result instanceof Object && "value" in result && "ttl" in result) {
        return result.value
      }

      return result
    })

    mvgService = new MvgService(feedContext, mockCacheService, mockApiClient)
  })

  it("performs a health check by fetching nearby stations", async () => {
    // Arrange
    mockApiClient.getNearbyStations.mockResolvedValueOnce([makeStation()])

    // Act
    await mvgService.healthCheck()

    // Assert
    expect(mockApiClient.getNearbyStations).toHaveBeenCalledTimes(1)
  })

  describe("getStop", () => {
    it("gets a stop by its ID", async () => {
      // Arrange
      mockApiClient.getStation.mockResolvedValueOnce(makeStation())

      // Act
      const stop = await mvgService.getStop("de:09162:70")

      // Assert
      expect(mockApiClient.getStation).toHaveBeenCalledWith("de:09162:70")
      expect(stop).toEqual({
        stopId: "de:09162:70",
        stopCode: null,
        name: "Universität",
        lat: 48.150527,
        lon: 11.581175,
      })
    })
  })

  describe("getRoutesForStop", () => {
    it("groups departures into routes with unique headsigns", async () => {
      // Arrange
      mockApiClient.getDepartures.mockResolvedValueOnce([
        makeDeparture({ lineId: "swm:02U06", destination: "Garching" }),
        makeDeparture({
          lineId: "swm:02U06",
          destination: "Klinikum Großhadern",
        }),
        makeDeparture({ lineId: "swm:02U06", destination: "Garching" }),
        makeDeparture({
          lineId: "swm:02U03",
          label: "U3",
          destination: "Moosach",
        }),
      ])

      // Act
      const routes = await mvgService.getRoutesForStop("de:09162:70")

      // Assert
      expect(mockApiClient.getDepartures).toHaveBeenCalledWith("de:09162:70", {
        limit: 100,
      })

      expect(routes).toEqual([
        {
          routeId: "swm:02U06",
          name: "U6",
          color: null,
          headsigns: ["Garching", "Klinikum Großhadern"],
        },
        {
          routeId: "swm:02U03",
          name: "U3",
          color: null,
          headsigns: ["Moosach"],
        },
      ])
    })
  })

  describe("getStopsInArea", () => {
    it("queries by the bbox center and filters results to the bbox", async () => {
      // Arrange
      const insideStation = makeStation({
        globalId: "de:09162:1",
        latitude: 48.15,
        longitude: 11.55,
      })
      const outsideStation = makeStation({
        globalId: "de:09162:2",
        latitude: 48.25,
        longitude: 11.55,
      })
      const boundaryStation = makeStation({
        globalId: "de:09162:3",
        latitude: 48.2,
        longitude: 11.6,
      })

      mockApiClient.getNearbyStations.mockResolvedValueOnce([
        insideStation,
        outsideStation,
        boundaryStation,
      ])

      // Act
      const stops = await mvgService.getStopsInArea([11.5, 48.1, 11.6, 48.2])

      // Assert
      expect(mockApiClient.getNearbyStations).toHaveBeenCalledWith(
        expect.closeTo(48.15),
        expect.closeTo(11.55),
      )

      expect(stops.map((stop) => stop.stopId)).toEqual([
        "de:09162:1",
        "de:09162:3",
      ])

      expect(stops[0]).toEqual({
        stopId: "de:09162:1",
        stopCode: null,
        name: "Universität",
        lat: 48.15,
        lon: 11.55,
      })
    })
  })

  describe("getUpcomingTripsForRoutesAtStops", () => {
    let dateSpy: MockInstance<() => any>

    beforeEach(() => {
      dateSpy = vi.spyOn(Date, "now")
      dateSpy.mockImplementation(() => NOW)
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    const testRoutesAtStops: RouteAtStop[] = [
      { stopId: "de:09162:70", routeId: "swm:02U06" },
      { stopId: "de:09162:70", routeId: "swm:02U03" },
      { stopId: "de:09162:6", routeId: "swm:02U04" },
    ] as const

    function getUpcomingTripsForTestRoutes(
      departuresByStop: Record<string, MvgDeparture[]>,
    ) {
      // Arrange
      mockApiClient.getDepartures.mockImplementation((stopId) => {
        const departures = departuresByStop[stopId]
        if (!departures) {
          return Promise.reject(new Error("Stop not found"))
        }

        return Promise.resolve(departures)
      })

      mockApiClient.getStation.mockImplementation((globalId) =>
        Promise.resolve(makeStation({ globalId })),
      )

      // Act
      return mvgService.getUpcomingTripsForRoutesAtStops(testRoutesAtStops)
    }

    it("maps departures to trips for the requested routes", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [
          makeDeparture({
            lineId: "swm:02U06",
            tripCode: 42,
            plannedDepartureTime: NOW + ms("5m"),
            realtimeDepartureTime: NOW + ms("7m"),
          }),
        ],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toEqual([
        {
          tripId: `swm:02U06-42-${NOW + ms("5m")}`,
          stopId: "de:09162:70",
          routeId: "swm:02U06",
          routeName: "U6",
          routeColor: null,
          stopName: "Universität",
          directionId: null,
          headsign: "Klinikum Großhadern",
          arrivalTime: new Date(NOW + ms("7m")),
          departureTime: new Date(NOW + ms("7m")),
          isRealtime: true,
        },
      ])
    })

    it("marks trips without real-time data accordingly", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [makeDeparture({ realtime: false })],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].isRealtime).toBe(false)
    })

    it("filters out cancelled departures", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [
          makeDeparture({ tripCode: 1, cancelled: true }),
          makeDeparture({ tripCode: 2 }),
        ],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].tripId).toContain("-2-")
    })

    it("filters out departures which have already departed", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [
          makeDeparture({
            tripCode: 1,
            realtimeDepartureTime: NOW - ms("1m"),
          }),
          makeDeparture({ tripCode: 2 }),
        ],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].tripId).toContain("-2-")
    })

    it("filters out departures for non-requested routes", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [
          makeDeparture({ lineId: "swm:02U05", tripCode: 1 }),
          makeDeparture({ lineId: "swm:02U06", tripCode: 2 }),
        ],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].routeId).toBe("swm:02U06")
    })

    it("filters out departures for routes which are requested, but at a different stop", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [],
        "de:09162:6": [makeDeparture({ lineId: "swm:02U06" })],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(0)
    })

    it("deduplicates departures for the same trip at the same stop", async () => {
      // Arrange & Act
      const duplicatedDeparture = makeDeparture({ tripCode: 42 })
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "de:09162:70": [duplicatedDeparture, { ...duplicatedDeparture }],
        "de:09162:6": [],
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
    })

    it("requests departures for each stop only once even if multiple routes are requested for the same stop", async () => {
      // Arrange & Act
      await getUpcomingTripsForTestRoutes({
        "de:09162:70": [makeDeparture()],
        "de:09162:6": [],
      })

      // Assert
      const numberOfTestStops = new Set(
        testRoutesAtStops.map((ras) => ras.stopId),
      ).size

      expect(testRoutesAtStops.length).toBeGreaterThan(numberOfTestStops)
      expect(mockApiClient.getDepartures).toHaveBeenCalledTimes(
        numberOfTestStops,
      )
    })

    it("caches departures briefly when upcoming departures exist", async () => {
      // Arrange & Act
      await getUpcomingTripsForTestRoutes({
        "de:09162:70": [makeDeparture()],
        "de:09162:6": [],
      })

      // Assert
      expect(rawCacheResults.get("departures-de:09162:70")).toMatchObject({
        ttl: ms("30s"),
      })
    })

    it("caches departures longer when no upcoming departures exist", async () => {
      // Arrange & Act
      await getUpcomingTripsForTestRoutes({
        "de:09162:70": [
          makeDeparture({ realtimeDepartureTime: NOW - ms("1m") }),
        ],
        "de:09162:6": [],
      })

      // Assert
      expect(rawCacheResults.get("departures-de:09162:70")).toMatchObject({
        ttl: ms("2m"),
      })
    })
  })
})
