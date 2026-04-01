import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import { describe, expect, it } from "vitest"
import { decodeTripUpdatesOnly } from "src/modules/feed/modules/gtfs/decode-trip-updates"

function encodeFeedMessage(
  entities: GtfsRt.IFeedEntity[],
): Uint8Array {
  const message = new GtfsRt.FeedMessage({
    header: {
      gtfsRealtimeVersion: "1.0",
      incrementality: GtfsRt.FeedHeader.Incrementality.FULL_DATASET,
      timestamp: Math.floor(Date.now() / 1000),
    },
    entity: entities,
  })
  return GtfsRt.FeedMessage.encode(message).finish()
}

describe("decodeTripUpdatesOnly", () => {
  it("should decode trip update entities", () => {
    const data = encodeFeedMessage([
      {
        id: "1",
        tripUpdate: {
          trip: { tripId: "trip-1", startDate: "20260331" },
          stopTimeUpdate: [
            {
              stopSequence: 5,
              stopId: "stop-A",
              arrival: { delay: 120 },
              departure: { delay: 130 },
            },
          ],
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(1)
    expect(result[0].trip?.tripId).toBe("trip-1")
    expect(result[0].trip?.startDate).toBe("20260331")
    expect(result[0].stopTimeUpdate).toHaveLength(1)
    expect(result[0].stopTimeUpdate![0].stopSequence).toBe(5)
    expect(result[0].stopTimeUpdate![0].stopId).toBe("stop-A")
    expect(result[0].stopTimeUpdate![0].arrival?.delay).toBe(120)
    expect(result[0].stopTimeUpdate![0].departure?.delay).toBe(130)
  })

  it("should skip vehicle position entities", () => {
    const data = encodeFeedMessage([
      {
        id: "1",
        vehicle: {
          trip: { tripId: "vehicle-trip" },
          position: { latitude: 47.6, longitude: -122.3 },
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(0)
  })

  it("should skip alert entities", () => {
    const data = encodeFeedMessage([
      {
        id: "1",
        alert: {
          headerText: {
            translation: [{ text: "Service disruption", language: "en" }],
          },
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(0)
  })

  it("should extract only trip updates from a mixed feed", () => {
    const data = encodeFeedMessage([
      {
        id: "vehicle-1",
        vehicle: {
          trip: { tripId: "v-trip" },
          position: { latitude: 47.6, longitude: -122.3 },
        },
      },
      {
        id: "trip-1",
        tripUpdate: {
          trip: { tripId: "tu-1" },
          stopTimeUpdate: [{ stopSequence: 1, arrival: { delay: 0 } }],
        },
      },
      {
        id: "alert-1",
        alert: {
          headerText: {
            translation: [{ text: "Alert", language: "en" }],
          },
        },
      },
      {
        id: "trip-2",
        tripUpdate: {
          trip: { tripId: "tu-2" },
          stopTimeUpdate: [
            { stopSequence: 3, departure: { time: 1711900000 } },
          ],
        },
      },
      {
        id: "vehicle-2",
        vehicle: {
          trip: { tripId: "v-trip-2" },
          position: { latitude: 40.7, longitude: -74.0 },
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(2)
    expect(result[0].trip?.tripId).toBe("tu-1")
    expect(result[1].trip?.tripId).toBe("tu-2")
  })

  it("should return empty array for an empty feed", () => {
    const data = encodeFeedMessage([])
    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(0)
  })

  it("should handle absolute time values as numbers", () => {
    const arrivalTime = Math.floor(Date.now() / 1000) + 300
    const departureTime = arrivalTime + 30

    const data = encodeFeedMessage([
      {
        id: "1",
        tripUpdate: {
          trip: { tripId: "trip-abs" },
          stopTimeUpdate: [
            {
              stopSequence: 1,
              arrival: { time: arrivalTime },
              departure: { time: departureTime },
            },
          ],
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(1)
    expect(result[0].stopTimeUpdate![0].arrival?.time).toBe(arrivalTime)
    expect(result[0].stopTimeUpdate![0].departure?.time).toBe(departureTime)
    expect(typeof result[0].stopTimeUpdate![0].arrival?.time).toBe("number")
  })

  it("should handle schedule relationship fields", () => {
    const data = encodeFeedMessage([
      {
        id: "1",
        tripUpdate: {
          trip: {
            tripId: "canceled-trip",
            scheduleRelationship:
              GtfsRt.TripDescriptor.ScheduleRelationship.CANCELED,
          },
          stopTimeUpdate: [
            {
              stopSequence: 1,
              scheduleRelationship:
                GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
            },
          ],
        },
      },
    ])

    const result = decodeTripUpdatesOnly(data)
    expect(result).toHaveLength(1)
    expect(result[0].trip?.scheduleRelationship).toBe(
      GtfsRt.TripDescriptor.ScheduleRelationship.CANCELED,
    )
    expect(result[0].stopTimeUpdate![0].scheduleRelationship).toBe(
      GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
    )
  })
})
