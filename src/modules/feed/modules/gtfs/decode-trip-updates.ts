import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import protobuf from "protobufjs/minimal"

type ITripUpdate = GtfsRt.ITripUpdate

// Field numbers from gtfs-realtime.proto
// https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto
const FEED_MESSAGE_ENTITY = 2 // FeedMessage.entity
const FEED_ENTITY_TRIP_UPDATE = 3 // FeedEntity.trip_update

/**
 * Selectively decodes only TripUpdate entities from a GTFS-RT FeedMessage,
 * skipping VehiclePosition and Alert entities at the wire format level to
 * avoid unnecessary deserialization.
 */
export function decodeTripUpdatesOnly(data: Uint8Array): ITripUpdate[] {
  const reader = protobuf.Reader.create(data)
  const end = reader.len
  const tripUpdates: ITripUpdate[] = []

  while (reader.pos < end) {
    const tag = reader.uint32()
    const fieldNumber = tag >>> 3
    const wireType = tag & 7

    switch (fieldNumber) {
      case FEED_MESSAGE_ENTITY: {
        const entityLength = reader.uint32()
        const entityEnd = reader.pos + entityLength
        const tripUpdate = decodeEntityTripUpdate(reader, entityEnd)
        if (tripUpdate) {
          tripUpdates.push(tripUpdate)
        }
        // Ensure we're at the end of this entity even if decoding stopped early
        reader.pos = entityEnd
        break
      }
      default:
        // Skip header (field 1) and any unknown fields
        reader.skipType(wireType)
        break
    }
  }

  return tripUpdates
}

function decodeEntityTripUpdate(
  reader: protobuf.Reader,
  end: number,
): ITripUpdate | null {
  let tripUpdate: ITripUpdate | null = null

  while (reader.pos < end) {
    const tag = reader.uint32()
    const fieldNumber = tag >>> 3
    const wireType = tag & 7

    if (fieldNumber === FEED_ENTITY_TRIP_UPDATE) {
      const decoded = GtfsRt.TripUpdate.decode(reader, reader.uint32())
      tripUpdate = GtfsRt.TripUpdate.toObject(decoded, {
        longs: Number,
      }) as ITripUpdate
    } else {
      // Skip id (1), is_deleted (2), vehicle (4), alert (5), and unknowns
      reader.skipType(wireType)
    }
  }

  return tripUpdate
}
