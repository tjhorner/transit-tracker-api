import { Inject } from "@nestjs/common"
import { BBox } from "geojson"
import ms from "ms"
import { PinoLogger } from "nestjs-pino"
import { DateTimeService } from "src/modules/datetime/datetime.service"
import type {
  FeedContext,
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { DeepReadonly } from "ts-essentials"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import { FEED_CONTEXT } from "../../feed-context"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import { MvgApiClient } from "./api-client"
import { MvgConfig, MvgConfigSchema } from "./config"

@RegisterFeedProvider("mvg")
export class MvgService implements FeedProvider {
  constructor(
    @Inject(FEED_CONTEXT) { feedCode }: FeedContext<MvgConfig>,
    private readonly cache: FeedCacheService,
    private readonly apiClient: MvgApiClient,
    private readonly dateTime: DateTimeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(`${MvgService.name}[${feedCode}]`)
  }

  static validateConfig(config: unknown): MvgConfig {
    return MvgConfigSchema.parse(config)
  }

  async healthCheck(): Promise<void> {
    await this.apiClient.getNearbyStations(48.137154, 11.576124)
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cache.cached(
      `stop-${stopId}`,
      async () => {
        const station = await this.apiClient.getStation(stopId)

        return {
          stopId: station.globalId,
          stopCode: null,
          name: station.name,
          lat: station.latitude,
          lon: station.longitude,
        }
      },
      ms("24h"),
    )
  }

  async getRoutesForStop(
    stopId: string,
  ): Promise<ReadonlyArray<DeepReadonly<StopRoute>>> {
    return this.cache.cached(
      `routesForStop-${stopId}`,
      async () => {
        const departures = await this.apiClient.getDepartures(stopId, {
          limit: 100,
        })

        const routeMap = new Map<
          string,
          {
            routeId: string
            name: string
            color: string | null
            headsigns: Set<string>
          }
        >()

        for (const departure of departures) {
          const routeId = departure.lineId
          if (!routeMap.has(routeId)) {
            routeMap.set(routeId, {
              routeId,
              name: departure.label,
              color: null,
              headsigns: new Set([departure.destination]),
            })
          } else {
            routeMap.get(routeId)!.headsigns.add(departure.destination)
          }
        }

        return Array.from(routeMap.values()).map((route) => ({
          routeId: route.routeId,
          name: route.name,
          color: route.color,
          headsigns: Array.from(route.headsigns),
        }))
      },
      ms("1h"),
    )
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const centerLat = (bbox[1] + bbox[3]) / 2
    const centerLon = (bbox[0] + bbox[2]) / 2

    const stations = await this.apiClient.getNearbyStations(
      centerLat,
      centerLon,
    )

    return stations
      .filter(
        (station) =>
          station.longitude >= bbox[0] &&
          station.longitude <= bbox[2] &&
          station.latitude >= bbox[1] &&
          station.latitude <= bbox[3],
      )
      .map<Stop>((station) => ({
        stopId: station.globalId,
        stopCode: null,
        name: station.name,
        lat: station.latitude,
        lon: station.longitude,
      }))
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

    for (const stopId of Object.keys(stopRouteMap)) {
      const routeIds = stopRouteMap[stopId]

      const departures = await this.cache.cached(
        `departures-${stopId}`,
        async () => {
          const transportTypes = [
            "UBAHN",
            "TRAM",
            "SBAHN",
            "BUS",
            "REGIONAL_BUS",
            "BAHN",
          ]
          const deps = await this.apiClient.getDepartures(stopId, {
            limit: 100,
            transportTypes,
          })

          const now = this.dateTime.now().getTime()
          const validDeps = deps.filter((d) => d.realtimeDepartureTime > now)

          let ttl = ms("30s")
          if (validDeps.length === 0) {
            ttl = ms("2m")
          }

          return { value: deps, ttl }
        },
      )

      if (!departures) {
        continue
      }

      const filteredDepartures = departures.filter(
        (dep) => routeIds.includes(dep.lineId) && !dep.cancelled,
      )

      for (const departure of filteredDepartures) {
        const departureTime = new Date(departure.realtimeDepartureTime)

        if (departureTime.getTime() < this.dateTime.now().getTime()) {
          continue
        }

        const tripId = `${departure.lineId}-${departure.tripCode}-${departure.plannedDepartureTime}`

        if (
          tripStops.some((ts) => ts.tripId === tripId && ts.stopId === stopId)
        ) {
          continue
        }

        const stop = await this.getStop(stopId)

        tripStops.push({
          tripId,
          stopId,
          routeId: departure.lineId,
          routeName: departure.label,
          routeColor: null,
          stopName: stop.name,
          directionId: null,
          headsign: departure.destination,
          arrivalTime: departureTime,
          departureTime: departureTime,
          isRealtime: departure.realtime,
        })
      }
    }

    return tripStops
  }
}
