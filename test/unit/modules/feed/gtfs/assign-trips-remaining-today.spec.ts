import { TripStop } from "src/modules/feed/interfaces/feed-provider.interface"
import { assignTripsRemainingToday } from "src/modules/feed/modules/gtfs/gtfs.service"

function makeTripStop(routeId: string, stopId: string, n: number): TripStop {
  return {
    tripId: `${routeId}-${stopId}-${n}`,
    routeId,
    stopId,
    routeName: routeId,
    routeColor: null,
    headsign: "",
    stopName: stopId,
    arrivalTime: new Date(Date.now() + n * 60000),
    departureTime: new Date(Date.now() + n * 60000),
    isRealtime: false,
  }
}

describe("assignTripsRemainingToday", () => {
  it("assigns 0 to a single-trip bucket", () => {
    const trips = [makeTripStop("r1", "s1", 0)]
    const keys = ["r1|s1|20260505"]

    assignTripsRemainingToday(trips, keys)

    expect(trips[0].tripsRemainingToday).toBe(0)
  })

  it("counts down from N-1 to 0 within a single bucket", () => {
    const trips = [
      makeTripStop("r1", "s1", 0),
      makeTripStop("r1", "s1", 1),
      makeTripStop("r1", "s1", 2),
      makeTripStop("r1", "s1", 3),
    ]
    const keys = Array(4).fill("r1|s1|20260505")

    assignTripsRemainingToday(trips, keys)

    expect(trips.map((t) => t.tripsRemainingToday)).toEqual([3, 2, 1, 0])
  })

  it("counts independently per (route, stop, service_date) bucket", () => {
    const trips = [
      makeTripStop("r1", "s1", 0),
      makeTripStop("r1", "s1", 1),
      makeTripStop("r2", "s1", 0),
      makeTripStop("r1", "s2", 0),
      makeTripStop("r1", "s2", 1),
      makeTripStop("r1", "s2", 2),
    ]
    const keys = [
      "r1|s1|20260505",
      "r1|s1|20260505",
      "r2|s1|20260505",
      "r1|s2|20260505",
      "r1|s2|20260505",
      "r1|s2|20260505",
    ]

    assignTripsRemainingToday(trips, keys)

    expect(trips.map((t) => t.tripsRemainingToday)).toEqual([1, 0, 0, 2, 1, 0])
  })

  it("treats the same (route, stop) on different service dates as separate buckets", () => {
    const trips = [
      makeTripStop("r1", "s1", 0),
      makeTripStop("r1", "s1", 1),
      makeTripStop("r1", "s1", 2),
    ]
    const keys = [
      "r1|s1|20260505",
      "r1|s1|20260505",
      "r1|s1|20260506",
    ]

    assignTripsRemainingToday(trips, keys)

    expect(trips.map((t) => t.tripsRemainingToday)).toEqual([1, 0, 0])
  })

  it("does nothing on empty input", () => {
    expect(() => assignTripsRemainingToday([], [])).not.toThrow()
  })
})
