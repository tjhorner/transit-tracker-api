import {
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import * as turf from "@turf/turf"
import { BBox } from "geojson"
import ms from "ms"
import OnebusawaySDK from "onebusaway-sdk"
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
import { OneBusAwayConfig, OneBusAwayConfigSchema } from "./config"

export interface StopGroup {
  id: string
  name: Name
  polylines: any[]
  stopIds: string[]
  subGroups: any[]
}

export interface Name {
  name: string
  names: string[]
  type: string
}

interface ArrivalsAndDeparturesResponse {
  arrivalsAndDepartures: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse.Data.Entry.ArrivalsAndDeparture[]
  references: {
    stops: {
      [
        key: string
      ]: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse.Data["references"]["stops"][number]
    }
    routes: {
      [
        key: string
      ]: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse.Data["references"]["routes"][number]
    }
    trips: {
      [
        key: string
      ]: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse.Data["references"]["trips"][number]
    }
  }
}

function latLonSpanToBounds(
  latCenter: number,
  lonCenter: number,
  latSpan: number,
  lonSpan: number,
): BBox {
  return [
    lonCenter - lonSpan / 2,
    latCenter - latSpan / 2,
    lonCenter + lonSpan / 2,
    latCenter + latSpan / 2,
  ]
}

@RegisterFeedProvider("onebusaway")
export class OneBusAwayService implements FeedProvider {
  private logger: Logger
  private config: Readonly<OneBusAwayConfig>

  constructor(
    @Inject(REQUEST) { feedCode, config }: FeedContext<OneBusAwayConfig>,
    private readonly cache: FeedCacheService,
    private readonly obaSdk: OnebusawaySDK,
  ) {
    this.logger = new Logger(`${OneBusAwayService.name}[${feedCode}]`)
    this.config = config
  }

  static validateConfig(config: any): OneBusAwayConfig {
    return OneBusAwayConfigSchema.parse(config)
  }

  async healthCheck(): Promise<void> {
    await this.obaSdk.currentTime.retrieve()
  }

  async getMetadata(): Promise<Record<string, any>> {
    return this.cache.cached(
      "metadata",
      async () => {
        let obaConfig: OnebusawaySDK.Config.ConfigRetrieveResponse
        try {
          obaConfig = await this.obaSdk.config.retrieve()
        } catch (e: any) {
          this.logger.error(`Error retrieving OneBusAway config: ${e.message}`)
          return {
            oneBusAwayServer: this.config.baseUrl,
          }
        }

        return {
          oneBusAwayServer: this.config.baseUrl,
          bundleId: obaConfig.data.entry.id,
          bundleName: obaConfig.data.entry.name,
          serviceDateFrom: obaConfig.data.entry.serviceDateFrom
            ? new Date(parseInt(obaConfig.data.entry.serviceDateFrom))
            : null,
          serviceDateTo: obaConfig.data.entry.serviceDateTo
            ? new Date(parseInt(obaConfig.data.entry.serviceDateTo))
            : null,
        }
      },
      ms("12h"),
    )
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cache.cached(
      "agencyBounds",
      async () => {
        const resp = await this.obaSdk.agenciesWithCoverage.list()

        const bboxes = turf.featureCollection(
          resp.data.list.map((agency) =>
            turf.bboxPolygon(
              latLonSpanToBounds(
                agency.lat,
                agency.lon,
                agency.latSpan,
                agency.lonSpan,
              ),
            ),
          ),
        )

        return turf.bbox(bboxes)
      },
      ms("24h"),
    )
  }

  private async getPossibleHeadsignsForRouteAtStop(
    routeId: string,
    stopId: string,
  ): Promise<string[]> {
    return this.cache.cached(
      `headsigns-${routeId}-${stopId}`,
      async () => {
        const stopsForRoute = await this.obaSdk.stopsForRoute.list(routeId, {
          includePolylines: false,
        })

        const stopGrouping = stopsForRoute.data.entry.stopGroupings?.[0]
        if (!stopGrouping) {
          return []
        }

        const stopGroups = (stopGrouping as any).stopGroups as StopGroup[] // bad API typings grumble grumble
        const names = stopGroups
          .filter((sg) => sg.stopIds.includes(stopId))
          .flatMap((sg) => sg.name.names)

        return names
      },
      ms("24h"),
    )
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cache.cached(
      `routesForStop-${stopId}`,
      async () => {
        let stop: OnebusawaySDK.Stop.StopRetrieveResponse
        try {
          stop = await this.obaSdk.stop.retrieve(stopId)
        } catch (e: any) {
          if (e.status === 404) {
            throw new NotFoundException(`Stop ${stopId} not found`)
          }

          throw new InternalServerErrorException(e)
        }

        if (stop === null) {
          throw new NotFoundException(`Stop ${stopId} not found`)
        }

        const stopRoutes: StopRoute[] = await Promise.all(
          stop.data.references.routes.map(async (route) => {
            const headsigns = await this.getPossibleHeadsignsForRouteAtStop(
              route.id,
              stopId,
            )

            const color = route.color?.replaceAll("#", "").trim() ?? null

            return {
              routeId: route.id,
              name: route.shortName ?? "Unnamed Route",
              color: color?.trim() !== "" ? color : null,
              headsigns,
            }
          }),
        )

        return stopRoutes
      },
      ms("24h"),
    )
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const centerLat = (bbox[1] + bbox[3]) / 2
    const centerLon = (bbox[0] + bbox[2]) / 2
    const latSpan = bbox[3] - bbox[1]
    const lonSpan = bbox[2] - bbox[0]

    const stops = await this.obaSdk.stopsForLocation.list({
      lat: centerLat,
      lon: centerLon,
      latSpan,
      lonSpan,
    })

    return stops.data.list.map<Stop>((stop) => ({
      stopId: stop.id,
      stopCode: stop.code ?? null,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
    }))
  }

  async listStops(): Promise<Stop[]> {
    return this.cache.cached(
      "allStops",
      async () => {
        const boundingBox = await this.getAgencyBounds()

        const latCenter = (boundingBox[1] + boundingBox[3]) / 2
        const lonCenter = (boundingBox[0] + boundingBox[2]) / 2
        const latSpan = boundingBox[3] - boundingBox[1]
        const lonSpan = boundingBox[2] - boundingBox[0]
        const stops = await this.obaSdk.stopsForLocation.list({
          lat: latCenter,
          lon: lonCenter,
          latSpan,
          lonSpan,
        })

        const allStops: Stop[] = stops.data.list.map<Stop>((stop) => ({
          stopId: stop.id,
          stopCode: stop.code ?? null,
          name: stop.name,
          lat: stop.lat,
          lon: stop.lon,
        }))

        return allStops
      },
      ms("24h"),
    )
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cache.cached(
      `stop-${stopId}`,
      async () => {
        let stop: OnebusawaySDK.Stop.StopRetrieveResponse
        try {
          stop = await this.obaSdk.stop.retrieve(stopId)
        } catch (e: any) {
          if (e.status === 404) {
            throw new NotFoundException(`Stop ${stopId} not found`)
          }

          throw new InternalServerErrorException(e)
        }

        return {
          stopId: stop.data.entry.id,
          stopCode: stop.data.entry.code ?? null,
          name: stop.data.entry.name,
          lat: stop.data.entry.lat,
          lon: stop.data.entry.lon,
        }
      },
      ms("24h"),
    )
  }

  async getArrivalsAndDeparturesForStop(
    stopId: string,
  ): Promise<ArrivalsAndDeparturesResponse | null> {
    return this.cache.cached(`arrivalsAndDepartures-${stopId}`, async () => {
      let resp!: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null
      try {
        // OneBusAway will sometimes intermittently return `null` for
        // arrivalAndDeparture, so we try a few times before giving up
        for (let nullRetries = 0; nullRetries < 3; nullRetries++) {
          resp = (await this.obaSdk.arrivalAndDeparture.list(stopId, {
            minutesBefore: 0,
            minutesAfter: 120,
          })) as OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null

          if (resp !== null) {
            break
          }

          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      } catch (e: any) {
        if (e.status === 404) {
          this.logger.warn(
            `getArrivalsAndDeparturesForStop: Requested stop ${stopId} not found`,
          )
          return { value: null, ttl: ms("1h") }
        }

        throw new InternalServerErrorException(e)
      }

      if (resp === null) {
        this.logger.warn(
          `getArrivalsAndDeparturesForStop: Received null response for stop ${stopId}`,
        )
        return { value: null, ttl: ms("10s") }
      } else if (resp.data.entry.arrivalsAndDepartures.length === 0) {
        // no arrivals for the next two hours so we can cache for longer
        return { value: null, ttl: ms("2h") }
      }

      let ttl = ms("30s")

      resp.data.entry.arrivalsAndDepartures.sort(
        (a, b) =>
          (a.predicted ? a.predictedArrivalTime : a.scheduledArrivalTime) -
          (b.predicted ? b.predictedArrivalTime : b.scheduledArrivalTime),
      )

      const firstArrival = resp.data.entry.arrivalsAndDepartures[0]
      const firstArrivalTime = firstArrival.predicted
        ? firstArrival.predictedArrivalTime
        : firstArrival.scheduledArrivalTime

      const timeUntilFirstArrival = firstArrivalTime - Date.now()
      if (timeUntilFirstArrival > ms("5m")) {
        ttl = ms("1m")
      }

      const tripsById = Object.fromEntries(
        resp.data.references.trips.map((t) => [t.id, t]),
      )
      const stopsById = Object.fromEntries(
        resp.data.references.stops.map((s) => [s.id, s]),
      )
      const routesById = Object.fromEntries(
        resp.data.references.routes.map((r) => [r.id, r]),
      )

      const value = {
        arrivalsAndDepartures: resp.data.entry.arrivalsAndDepartures,
        references: {
          trips: tripsById,
          stops: stopsById,
          routes: routesById,
        },
      }

      return { value, ttl }
    })
  }

  // duplicated logic from GTFS but whatever
  private removeFromStart(str: string, substrs: string[]): string {
    for (const substr of substrs) {
      if (str.startsWith(substr)) {
        return str.slice(substr.length).trim()
      }
    }

    return str
  }

  private removeRouteNameFromHeadsign(
    routeShortName: string | undefined,
    headsign: string,
  ): string {
    if (!routeShortName) {
      return headsign.trim()
    }

    if (!headsign) {
      return ""
    }

    if (!headsign.startsWith(routeShortName)) {
      return headsign.trim()
    }

    return this.removeFromStart(headsign.trim(), [
      `${routeShortName} `,
      `${routeShortName} - `,
      `${routeShortName}: `,
    ])
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

    const stopIds = Object.keys(stopRouteMap)
    const arrivalsPerStop = await Promise.all(
      stopIds.map((stopId) => this.getArrivalsAndDeparturesForStop(stopId)),
    )

    const tripStops: TripStop[] = []
    const seenTripStops = new Map<
      string,
      { index: number; lastUpdateTime: number }
    >()

    for (let i = 0; i < stopIds.length; i++) {
      const stopId = stopIds[i]
      const arrivalsAndDeparturesResp = arrivalsPerStop[i]
      const routeIds = stopRouteMap[stopId]

      if (!arrivalsAndDeparturesResp) {
        continue
      }

      const arrivalsAndDepartures =
        arrivalsAndDeparturesResp.arrivalsAndDepartures.filter(
          (ad) =>
            routeIds.includes(ad.routeId) && ad.departureEnabled !== false,
        )

      for (const ad of arrivalsAndDepartures) {
        const tripStopKey = `${ad.tripId}-${stopId}`
        const existing = seenTripStops.get(tripStopKey)
        if (existing && existing.lastUpdateTime >= (ad.lastUpdateTime ?? 0)) {
          continue
        }

        const departureTime =
          ad.predicted && ad.predictedDepartureTime
            ? new Date(ad.predictedDepartureTime)
            : new Date(ad.scheduledDepartureTime)

        if (departureTime.getTime() < Date.now()) {
          continue
        }

        const arrivalTime =
          ad.predicted && ad.predictedArrivalTime
            ? new Date(ad.predictedArrivalTime)
            : new Date(ad.scheduledArrivalTime)

        const staticTrip = arrivalsAndDeparturesResp.references.trips[ad.tripId]
        const staticStop = arrivalsAndDeparturesResp.references.stops[stopId]
        const staticRoute =
          arrivalsAndDeparturesResp.references.routes[ad.routeId]

        const color = staticRoute?.color?.replaceAll("#", "").trim() ?? null

        const tripStop: TripStop = {
          tripId: ad.tripId,
          stopId,
          directionId: staticTrip?.directionId ?? null,
          routeId: ad.routeId,
          routeName: ad.routeShortName ?? "Unnamed Route",
          routeColor: color?.trim() !== "" ? color : null,
          stopName: staticStop?.name ?? "Unnamed Stop",
          headsign: this.removeRouteNameFromHeadsign(
            ad.routeShortName,
            ad.tripHeadsign,
          ),
          arrivalTime,
          departureTime,
          isRealtime: ad.predicted ?? false,
        }

        if (existing) {
          tripStops[existing.index] = tripStop
          existing.lastUpdateTime = ad.lastUpdateTime ?? 0
        } else {
          seenTripStops.set(tripStopKey, {
            index: tripStops.length,
            lastUpdateTime: ad.lastUpdateTime ?? 0,
          })
          tripStops.push(tripStop)
        }
      }
    }

    return tripStops
  }
}
