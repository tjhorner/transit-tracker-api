import {
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { BBox } from "geojson"
import ms from "ms"
import type {
  FeedContext,
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"
import { FeedCacheService } from "../feed-cache/feed-cache.service"
import { MvgConfig, MvgConfigSchema } from "./config"

interface MvgDeparture {
  plannedDepartureTime: number
  realtime: boolean
  delayInMinutes: number | null
  realtimeDepartureTime: number
  transportType: string
  label: string
  divaId: string
  network: string
  trainType: string
  destination: string
  cancelled: boolean
  sev: boolean
  platform: number | null
  platformChanged: boolean
  messages: any[]
  infos: any[]
  bannerHash: string
  occupancy: string
  stationGlobalId: string
  stopPointGlobalId: string
  lineId: string
  tripCode: number
}

interface MvgStation {
  globalId: string
  name: string
  place: string
  latitude: number
  longitude: number
  type: string
  products: string[]
  tariffZones: string
  transportTypes: string[]
}

@RegisterFeedProvider("mvg")
export class MvgService implements FeedProvider {
  private logger: Logger
  private config: Readonly<MvgConfig>
  private baseUrl: string

  constructor(
    @Inject(REQUEST) { feedCode, config }: FeedContext<MvgConfig>,
    private readonly cache: FeedCacheService,
  ) {
    this.logger = new Logger(`${MvgService.name}[${feedCode}]`)
    this.config = MvgConfigSchema.parse(config)
    this.baseUrl = this.config.baseUrl
  }

  async healthCheck(): Promise<void> {
    await this.fetchJson(
      `/stations/nearby?latitude=48.137154&longitude=11.576124`,
    )
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`)
    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException(`Resource not found: ${url}`)
      }
      throw new InternalServerErrorException(
        `MVG API request failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.json()
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cache.cached(
      `stop-${stopId}`,
      async () => {
        const station = await this.fetchJson<MvgStation>(
          `/stations/${encodeURIComponent(stopId)}`,
        )

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

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cache.cached(
      `routesForStop-${stopId}`,
      async () => {
        const departures = await this.fetchJson<MvgDeparture[]>(
          `/departures?globalId=${encodeURIComponent(stopId)}&limit=100`,
        )

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

    const stations = await this.fetchJson<MvgStation[]>(
      `/stations/nearby?latitude=${centerLat}&longitude=${centerLon}`,
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
          const deps = await this.fetchJson<MvgDeparture[]>(
            `/departures?globalId=${encodeURIComponent(stopId)}&limit=100&transportTypes=${transportTypes.join(",")}`,
          )

          const now = Date.now()
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

        if (departureTime.getTime() < Date.now()) {
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
