import { Inject, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import * as turf from "@turf/turf"
import { BBox } from "geojson"
import {
  createClient,
  DeparturesArrivalsOptions,
  HafasClient,
} from "hafas-client"
import ms from "ms"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import type {
  FeedContext,
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "../../interfaces/feed-provider.interface"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import { HafasConfig } from "./config"

@RegisterFeedProvider("hafas")
export class HafasService implements FeedProvider {
  private readonly logger: Logger
  private readonly hafasClient: HafasClient

  constructor(
    @Inject(REQUEST) { feedCode, config }: FeedContext<HafasConfig>,
    private readonly cache: FeedCacheService,
  ) {
    this.logger = new Logger(`${HafasService.name}[${feedCode}]`)

    this.logger.log(`Initializing with HAFAS profile: ${config.profile}`)
    const { profile } = require(`hafas-client/p/${config.profile}`)
    this.hafasClient = createClient(profile, config.userAgent)
  }

  getMetadata(): Promise<Record<string, any>> {
    return this.cache.cached(
      "metadata",
      () => this.hafasClient.serverInfo(undefined),
      ms("12h"),
    )
  }

  async healthCheck(): Promise<void> {
    await this.hafasClient.serverInfo(undefined)
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    const stopRouteMap = routes.reduce(
      (acc, { routeId, stopId }) => {
        if (!acc[stopId]) {
          acc[stopId] = []
        }
        acc[stopId].push(routeId)
        return acc
      },
      {} as Record<string, string[]>,
    )

    const tripStops: TripStop[] = []
    for (const stopId in stopRouteMap) {
      const routeIds = stopRouteMap[stopId]
      const trips = await this.getUpcomingTripsForStop(stopId)

      for (const trip of trips) {
        if (trip.departureTime < new Date()) {
          continue
        }

        if (routeIds.includes(trip.routeId)) {
          tripStops.push(trip)
        }
      }
    }

    return tripStops
  }

  private async getUpcomingTripsForStop(stopId: string): Promise<TripStop[]> {
    return this.cache.cached(`upcomingTripsForStop-${stopId}`, async () => {
      const opts: DeparturesArrivalsOptions = {
        duration: 60,
        results: 150,
        subStops: false,
        entrances: false,
        linesOfStops: false,
        remarks: false,
      }

      const [{ arrivals }, { departures }] = await Promise.all([
        this.hafasClient.arrivals(stopId, opts),
        this.hafasClient.departures(stopId, opts),
      ])

      const tripStops: TripStop[] = []

      for (const group in { departures, arrivals }) {
        const trips = group === "arrivals" ? arrivals : departures
        for (const trip of trips) {
          if (trip.cancelled) {
            continue
          }

          const when = trip.when ?? trip.plannedWhen
          if (!when) {
            continue
          }

          const existingTripStop = tripStops.find(
            (ts) => ts.tripId === trip.tripId,
          )

          const isRealtime = typeof trip.delay === "number"

          if (existingTripStop) {
            if (group === "departures") {
              existingTripStop.departureTime = new Date(when)
            } else {
              existingTripStop.arrivalTime = new Date(when)
            }

            existingTripStop.isRealtime =
              existingTripStop.isRealtime || isRealtime

            continue
          }

          tripStops.push({
            tripId: trip.tripId,
            stopId,
            routeId: trip.line?.id ?? "unknown",
            routeName: trip.line?.name ?? "Unnamed Route",
            routeColor: null,
            stopName: trip.stop?.name ?? "Unnamed Stop",
            headsign:
              trip.direction ??
              trip.destination?.name ??
              trip.stop?.name ??
              "Unknown",
            arrivalTime: new Date(when),
            departureTime: new Date(when),
            vehicle: null, // Hafas does not appear to provide vehicle IDs
            isRealtime,
          })
        }
      }

      return tripStops
    })
  }

  getStop(stopId: string): Promise<Stop> {
    throw new Error("Method not implemented.")
  }

  getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cache.cached(`routesForStop-${stopId}`, async () => {
      const stop = await this.hafasClient.stop(stopId, {
        subStops: false,
        entrances: false,
        linesOfStops: true,
      })

      if (stop.type === "location") {
        return []
      }

      if (!stop.lines || stop.lines.length === 0) {
        return []
      }

      return stop.lines!.map((line) => ({
        routeId: line.id!,
        name: line.name ?? "Unknown Route Name",
        color: null,
        headsigns: (line.directions as string[]) ?? [],
      }))
    })
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const center = turf.center(turf.bboxPolygon(bbox))
    const distance =
      Math.max(
        turf.distance(
          turf.point([bbox[0], bbox[1]]),
          turf.point([bbox[2], bbox[3]]),
          { units: "meters" },
        ),
        turf.distance(
          turf.point([bbox[0], bbox[3]]),
          turf.point([bbox[2], bbox[1]]),
          { units: "meters" },
        ),
      ) / 2

    const stops = await this.hafasClient.nearby(
      {
        type: "location",
        longitude: center.geometry.coordinates[0],
        latitude: center.geometry.coordinates[1],
      },
      {
        results: 200,
        distance,
      },
    )

    return stops
      .filter((s) => s.type === "stop" || s.type === "station")
      .filter((s) => s.location !== undefined && s.id !== undefined)
      .map((stop) => ({
        stopId: stop.id!,
        stopCode: null,
        name: stop.name ?? "Unknown Stop Name",
        lon: stop.location!.longitude!,
        lat: stop.location!.latitude!,
      }))
  }
}
