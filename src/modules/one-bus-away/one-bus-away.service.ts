import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common"
import OnebusawaySDK from "onebusaway-sdk"
import { Cache } from "@nestjs/cache-manager"
import { CACHE_MANAGER } from "@nestjs/cache-manager"
import {
  BBox,
  RouteAtStop,
  ScheduleProvider,
  Stop,
  StopRoute,
  TripStop,
} from "src/interfaces/schedule-provider.interface"

export interface OneBusAwayConfig {
  baseUrl: string
  apiKey: string
}

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

function latLonSpanToBounds(
  latCenter: number,
  lonCenter: number,
  latSpan: number,
  lonSpan: number,
): BBox {
  return [
    latCenter - latSpan / 2,
    lonCenter - lonSpan / 2,
    latCenter + latSpan / 2,
    lonCenter + lonSpan / 2,
  ]
}

function sumOfBboxes(bbox1: BBox, bbox2: BBox): BBox {
  return [
    Math.min(bbox1[0], bbox2[0]),
    Math.min(bbox1[1], bbox2[1]),
    Math.max(bbox1[2], bbox2[2]),
    Math.max(bbox1[3], bbox2[3]),
  ]
}

function sumOfAllBboxes(bboxes: BBox[]): BBox {
  return bboxes.reduce(sumOfBboxes)
}

@Injectable()
export class OneBusAwayService implements ScheduleProvider<OneBusAwayConfig> {
  private feedCode: string
  private obaSdk: OnebusawaySDK

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  init(feedCode: string, config: OneBusAwayConfig) {
    this.feedCode = feedCode
    this.obaSdk = new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 5,
    })
  }

  private async cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cacheKey = `${this.feedCode}-${key}`
    const cached = await this.cacheManager.get<T>(cacheKey)
    if (cached) {
      return cached
    }

    const data = await fn()

    this.cacheManager.set(cacheKey, data, ttl)
    return data
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cached(
      "agencyBounds",
      async () => {
        const resp = await this.obaSdk.agenciesWithCoverage.list()

        const bboxes = resp.data.list.map((agency) =>
          latLonSpanToBounds(
            agency.lat,
            agency.lon,
            agency.latSpan,
            agency.lonSpan,
          ),
        )

        return sumOfAllBboxes(bboxes)
      },
      86_400_000,
    )
  }

  private async getPossibleHeadsignsForRouteAtStop(
    routeId: string,
    stopId: string,
  ): Promise<string[]> {
    return this.cached(
      `headsigns-${routeId}-${stopId}`,
      async () => {
        const stopsForRoute = await this.obaSdk.stopsForRoute.list(routeId, {
          includePolylines: false,
        })

        const stopGrouping = stopsForRoute.data.entry.stopGroupings[0]
        if (!stopGrouping) {
          return []
        }

        const stopGroups = (stopGrouping as any).stopGroups as StopGroup[] // bad API typings grumble grumble
        const names = stopGroups
          .filter((sg) => sg.stopIds.includes(stopId))
          .flatMap((sg) => sg.name.names)

        return names
      },
      86_400_000,
    )
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    return this.cached(
      `routesForStop-${stopId}`,
      async () => {
        let stop: OnebusawaySDK.Stop.StopRetrieveResponse
        try {
          stop = await this.obaSdk.stop.retrieve(stopId)
        } catch (e: any) {
          if (e.code === 404) {
            throw new NotFoundException(`Stop ${stopId} not found`)
          }

          throw new InternalServerErrorException(e)
        }

        const stopRoutes: StopRoute[] = []
        for (const route of stop.data.references.routes) {
          const headsigns = await this.getPossibleHeadsignsForRouteAtStop(
            route.id,
            stopId,
          )

          stopRoutes.push({
            routeId: route.id,
            name: route.shortName,
            headsigns,
          })
        }

        return stopRoutes
      },
      86_400_000,
    )
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const centerLat = (bbox[0] + bbox[2]) / 2
    const centerLon = (bbox[1] + bbox[3]) / 2
    const latSpan = bbox[2] - bbox[0]
    const lonSpan = bbox[3] - bbox[1]

    const stops = await this.obaSdk.stopsForLocation.list({
      lat: centerLat,
      lon: centerLon,
      latSpan,
      lonSpan,
    })

    return stops.data.list.map((stop) => ({
      stopId: stop.id,
      stopCode: stop.code,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
    }))
  }

  async getArrivalsAndDeparturesForStop(
    stopId: string,
  ): Promise<OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse> {
    return this.cached(
      `arrivalsAndDepartures-${stopId}`,
      async () => {
        let resp: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse
        try {
          resp = await this.obaSdk.arrivalAndDeparture.list(stopId, {
            minutesBefore: 0,
            minutesAfter: 60,
          })
        } catch (e: any) {
          if (e.code === 404) {
            throw new NotFoundException(`Stop ${stopId} not found`)
          }

          throw new InternalServerErrorException(e)
        }

        return resp
      },
      10_000,
    )
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
      const arrivalsAndDeparturesResp =
        await this.getArrivalsAndDeparturesForStop(stopId)

      const arrivalsAndDepartures =
        arrivalsAndDeparturesResp.data.entry.arrivalsAndDepartures.filter(
          (ad) => routeIds.includes(ad.routeId),
        )

      for (const ad of arrivalsAndDepartures) {
        if (
          tripStops.some(
            (ts) => ts.tripId === ad.tripId && ts.stopId === stopId,
          )
        ) {
          continue
        }

        const staticStop = arrivalsAndDeparturesResp.data.references.stops.find(
          (s) => s.id === stopId,
        )

        const staticRoute =
          arrivalsAndDeparturesResp.data.references.routes.find(
            (r) => r.id === ad.routeId,
          )

        const arrivalTime = ad.predicted
          ? new Date(ad.predictedArrivalTime)
          : new Date(ad.scheduledArrivalTime)
        if (arrivalTime < new Date()) {
          continue
        }

        const departureTime = ad.predicted
          ? new Date(ad.predictedDepartureTime)
          : new Date(ad.scheduledDepartureTime)

        const color = staticRoute.color?.replaceAll("#", "")

        tripStops.push({
          tripId: ad.tripId,
          stopId,
          routeId: ad.routeId,
          routeName: ad.routeShortName,
          routeColor: color?.trim() !== "" ? color : null,
          stopName: staticStop.name,
          headsign: ad.tripHeadsign,
          arrivalTime,
          departureTime,
          isRealtime: ad.predicted,
        })
      }
    }

    return tripStops
  }
}
