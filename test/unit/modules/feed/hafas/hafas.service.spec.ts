import type { Alternative, HafasClient } from "hafas-client"
import ms from "ms"
import { PinoLogger } from "nestjs-pino"
import { DateTimeService } from "src/modules/datetime/datetime.service"
import { StopNotFoundError } from "src/modules/feed/feed.errors"
import {
  FeedContext,
  RouteAtStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { FeedCacheService } from "src/modules/feed/modules/feed-cache/feed-cache.service"
import { HafasConfig } from "src/modules/feed/modules/hafas/config"
import { HafasService } from "src/modules/feed/modules/hafas/hafas.service"
import { mock, MockProxy } from "vitest-mock-extended"

const feedContext: FeedContext<HafasConfig> = {
  feedCode: "test-feed",
  config: {
    profile: "db",
    userAgent: "transit-tracker-api-test",
  },
}

const NOW = new Date("2025-12-17T04:00:00Z")

function inMinutes(minutes: number): string {
  return new Date(NOW.getTime() + minutes * ms("1m")).toISOString()
}

function makeTrip(overrides: Partial<Alternative> = {}): Alternative {
  return {
    tripId: "trip-1",
    stop: { type: "stop", id: "stop-1", name: "Hauptbahnhof" },
    when: inMinutes(5),
    plannedWhen: inMinutes(5),
    delay: 60,
    direction: "Flughafen",
    line: { type: "line", id: "s8", name: "S8" },
    ...overrides,
  } as Alternative
}

interface StopBoard {
  arrivals?: Alternative[]
  departures?: Alternative[]
}

describe("HafasService", () => {
  let hafasService: HafasService
  let mockCacheService: MockProxy<FeedCacheService>
  let mockHafasClient: MockProxy<HafasClient>
  let mockDateTime: MockProxy<DateTimeService>

  beforeEach(() => {
    mockCacheService = mock<FeedCacheService>()
    mockHafasClient = mock<HafasClient>()
    mockDateTime = mock<DateTimeService>()

    mockCacheService.cached.mockImplementation(async (_, fn) => {
      const result = await fn()
      if (result instanceof Object && "value" in result && "ttl" in result) {
        return result.value
      }

      return result
    })

    mockDateTime.now.mockReturnValue(NOW)

    hafasService = new HafasService(
      feedContext,
      mockCacheService,
      mockHafasClient,
      mockDateTime,
      mock<PinoLogger>(),
    )
  })

  it("performs a health check against the server info endpoint", async () => {
    // Arrange
    mockHafasClient.serverInfo.mockResolvedValueOnce({} as any)

    // Act
    await hafasService.healthCheck()

    // Assert
    expect(mockHafasClient.serverInfo).toHaveBeenCalledTimes(1)
  })

  it("returns the server info as metadata", async () => {
    // Arrange
    mockHafasClient.serverInfo.mockResolvedValueOnce({
      hciVersion: "1.62",
    } as any)

    // Act
    const metadata = await hafasService.getMetadata()

    // Assert
    expect(metadata).toEqual({ hciVersion: "1.62" })
  })

  it("does not implement getStop", () => {
    expect(() => hafasService.getStop()).toThrow("Method not implemented.")
  })

  describe("getUpcomingTripsForRoutesAtStops", () => {
    const testRoutesAtStops: RouteAtStop[] = [
      { stopId: "stop-1", routeId: "s8" },
      { stopId: "stop-1", routeId: "u5" },
      { stopId: "stop-2", routeId: "s1" },
    ] as const

    function getUpcomingTripsForTestRoutes(
      boards: Record<string, StopBoard>,
      routes: RouteAtStop[] = testRoutesAtStops,
    ) {
      // Arrange
      mockHafasClient.arrivals.mockImplementation((stopId): any => {
        const board = boards[stopId as string]
        if (!board) {
          return Promise.reject(new Error("Stop not found"))
        }

        return Promise.resolve({ arrivals: board.arrivals ?? [] })
      })

      mockHafasClient.departures.mockImplementation((stopId): any => {
        const board = boards[stopId as string]
        if (!board) {
          return Promise.reject(new Error("Stop not found"))
        }

        return Promise.resolve({ departures: board.departures ?? [] })
      })

      // Act
      return hafasService.getUpcomingTripsForRoutesAtStops(routes)
    }

    it("maps departures to trips for the requested routes", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": { departures: [makeTrip()] },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toEqual([
        {
          tripId: "trip-1",
          stopId: "stop-1",
          routeId: "s8",
          routeName: "S8",
          routeColor: null,
          stopName: "Hauptbahnhof",
          directionId: "Flughafen",
          headsign: "Flughafen",
          arrivalTime: new Date(inMinutes(5)),
          departureTime: new Date(inMinutes(5)),
          isRealtime: true,
        },
      ])
    })

    it("merges arrival and departure entries for the same trip", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          arrivals: [makeTrip({ when: inMinutes(4) })],
          departures: [makeTrip({ when: inMinutes(6) })],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].arrivalTime).toEqual(new Date(inMinutes(4)))
      expect(upcomingTrips[0].departureTime).toEqual(new Date(inMinutes(6)))
    })

    it("marks a merged trip as real-time if either entry has a delay, including a delay of zero", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          arrivals: [makeTrip({ delay: 0 })],
          departures: [makeTrip({ delay: undefined })],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].isRealtime).toBe(true)
    })

    it("marks trips without any delay information as not real-time", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": { departures: [makeTrip({ delay: undefined })] },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].isRealtime).toBe(false)
    })

    it("falls back to the planned time when no real-time estimate exists", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [
            makeTrip({ when: undefined, plannedWhen: inMinutes(10) }),
          ],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].departureTime).toEqual(new Date(inMinutes(10)))
    })

    it("skips trips with neither a real-time nor a planned time", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [makeTrip({ when: undefined, plannedWhen: undefined })],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(0)
    })

    it("filters out cancelled trips", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [
            makeTrip({ tripId: "trip-1", cancelled: true }),
            makeTrip({ tripId: "trip-2" }),
          ],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].tripId).toBe("trip-2")
    })

    it("filters out trips which have already departed", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [
            makeTrip({ tripId: "trip-1", when: inMinutes(-5) }),
            makeTrip({ tripId: "trip-2" }),
          ],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].tripId).toBe("trip-2")
    })

    it("filters out trips for non-requested routes", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [
            makeTrip({ line: { type: "line", id: "s2", name: "S2" } }),
          ],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips).toHaveLength(0)
    })

    it("filters out trips for routes which are requested, but at a different stop", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {},
        "stop-2": {
          departures: [makeTrip({ stop: undefined })],
        },
      })

      // Assert
      expect(upcomingTrips).toHaveLength(0)
    })

    it("requests each stop's arrivals and departures only once even if multiple routes are requested for the same stop", async () => {
      // Arrange & Act
      await getUpcomingTripsForTestRoutes({
        "stop-1": { departures: [makeTrip()] },
        "stop-2": {},
      })

      // Assert
      const numberOfTestStops = new Set(
        testRoutesAtStops.map((ras) => ras.stopId),
      ).size

      expect(testRoutesAtStops.length).toBeGreaterThan(numberOfTestStops)
      expect(mockHafasClient.arrivals).toHaveBeenCalledTimes(numberOfTestStops)
      expect(mockHafasClient.departures).toHaveBeenCalledTimes(
        numberOfTestStops,
      )
    })

    it("falls back to the destination or stop name for the headsign", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes({
        "stop-1": {
          departures: [
            makeTrip({
              tripId: "trip-1",
              direction: undefined,
              destination: { type: "stop", id: "dest", name: "Erding" },
            }),
            makeTrip({
              tripId: "trip-2",
              direction: undefined,
              destination: undefined,
            }),
            makeTrip({
              tripId: "trip-3",
              direction: undefined,
              destination: undefined,
              stop: undefined,
            }),
          ],
        },
        "stop-2": {},
      })

      // Assert
      expect(upcomingTrips.map((trip) => [trip.tripId, trip.headsign])).toEqual(
        [
          ["trip-1", "Erding"],
          ["trip-2", "Hauptbahnhof"],
          ["trip-3", "Unknown"],
        ],
      )
    })

    it("applies fallbacks for missing line and stop information", async () => {
      // Arrange & Act
      const upcomingTrips = await getUpcomingTripsForTestRoutes(
        {
          "stop-1": {
            departures: [makeTrip({ line: undefined, stop: undefined })],
          },
        },
        [{ stopId: "stop-1", routeId: "unknown" }],
      )

      // Assert
      expect(upcomingTrips).toHaveLength(1)
      expect(upcomingTrips[0].routeId).toBe("unknown")
      expect(upcomingTrips[0].routeName).toBe("Unnamed Route")
      expect(upcomingTrips[0].stopName).toBe("Unnamed Stop")
    })
  })

  describe("getRoutesForStop", () => {
    it("returns no routes when the stop resolves to a plain location", async () => {
      // Arrange
      mockHafasClient.stop.mockResolvedValueOnce({ type: "location" } as any)

      // Act
      const routes = await hafasService.getRoutesForStop("stop-1")

      // Assert
      expect(routes).toEqual([])
    })

    it("returns no routes when the stop has no lines", async () => {
      // Arrange
      mockHafasClient.stop.mockResolvedValueOnce({
        type: "stop",
        id: "stop-1",
        lines: [],
      } as any)

      // Act
      const routes = await hafasService.getRoutesForStop("stop-1")

      // Assert
      expect(routes).toEqual([])
    })

    it("maps the stop's lines to routes", async () => {
      // Arrange
      mockHafasClient.stop.mockResolvedValueOnce({
        type: "stop",
        id: "stop-1",
        lines: [
          {
            type: "line",
            id: "s8",
            name: "S8",
            directions: ["Flughafen", "Herrsching"],
          },
          { type: "line", id: "u5", name: undefined, directions: undefined },
        ],
      } as any)

      // Act
      const routes = await hafasService.getRoutesForStop("stop-1")

      // Assert
      expect(routes).toEqual([
        {
          routeId: "s8",
          name: "S8",
          color: null,
          headsigns: ["Flughafen", "Herrsching"],
        },
        {
          routeId: "u5",
          name: "Unknown Route Name",
          color: null,
          headsigns: [],
        },
      ])
    })

    it("translates a hafas NOT_FOUND into a StopNotFoundError", async () => {
      // Arrange
      mockHafasClient.stop.mockRejectedValueOnce(
        Object.assign(new Error("NOT_FOUND"), {
          isHafasError: true,
          code: "NOT_FOUND",
        }),
      )

      // Act
      const act = hafasService.getRoutesForStop("stop-1")

      // Assert
      await expect(act).rejects.toBeInstanceOf(StopNotFoundError)
      await expect(act).rejects.toMatchObject({ stopId: "stop-1" })
    })
  })

  describe("getStopsInArea", () => {
    it("queries around the bbox center and maps stops and stations", async () => {
      // Arrange
      mockHafasClient.nearby.mockResolvedValueOnce([
        {
          type: "stop",
          id: "stop-1",
          name: "Marienplatz",
          location: { type: "location", latitude: 48.137, longitude: 11.575 },
        },
        {
          type: "station",
          id: "station-1",
          name: undefined,
          location: { type: "location", latitude: 48.14, longitude: 11.56 },
        },
        {
          type: "location",
          id: "poi-1",
          name: "Some Location",
          latitude: 48.13,
          longitude: 11.57,
        },
        { type: "stop", id: "stop-2", name: "No Location" },
        {
          type: "stop",
          id: undefined,
          name: "No ID",
          location: { type: "location", latitude: 48.15, longitude: 11.58 },
        },
      ] as any)

      // Act
      const stops = await hafasService.getStopsInArea([11.5, 48.1, 11.6, 48.2])

      // Assert
      expect(mockHafasClient.nearby).toHaveBeenCalledWith(
        {
          type: "location",
          longitude: expect.closeTo(11.55),
          latitude: expect.closeTo(48.15),
        },
        {
          results: 200,
          distance: expect.any(Number),
        },
      )

      expect(stops).toEqual([
        {
          stopId: "stop-1",
          stopCode: null,
          name: "Marienplatz",
          lat: 48.137,
          lon: 11.575,
        },
        {
          stopId: "station-1",
          stopCode: null,
          name: "Unknown Stop Name",
          lat: 48.14,
          lon: 11.56,
        },
      ])
    })
  })
})
