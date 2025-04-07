import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager"
import {
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { Counter, Histogram, ValueType } from "@opentelemetry/api"
import * as turf from "@turf/turf"
import { BBox } from "geojson"
import { RateLimiter } from "limiter"
import { MetricService } from "nestjs-otel"
import OnebusawaySDK from "onebusaway-sdk"
import {
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { RegisterFeedProvider } from "../../decorators/feed-provider.decorator"

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
    lonCenter - lonSpan / 2,
    latCenter - latSpan / 2,
    lonCenter + lonSpan / 2,
    latCenter + latSpan / 2,
  ]
}

@RegisterFeedProvider("onebusaway")
export class OneBusAwayService implements FeedProvider<OneBusAwayConfig> {
  private logger = new Logger(OneBusAwayService.name)
  private feedCode!: string
  private obaSdk!: OnebusawaySDK
  private obaRateLimiter = new RateLimiter({
    tokensPerInterval: 1,
    interval: 200,
  })

  private obaRequestCounter: Counter
  private obaResponseCounter: Counter
  private obaRequestDuration: Histogram
  private obaCacheHits: Counter
  private obaCacheMisses: Counter

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    metricService: MetricService,
  ) {
    this.obaRequestCounter = metricService.getCounter(
      "onebusaway_request_count",
      {
        description: "Number of requests made to the OneBusAway API",
        unit: "requests",
      },
    )

    this.obaResponseCounter = metricService.getCounter(
      "onebusaway_response_count",
      {
        description: "Number of responses received from the OneBusAway API",
        unit: "responses",
      },
    )

    this.obaRequestDuration = metricService.getHistogram(
      "onebusaway_request_duration",
      {
        description: "Duration of requests made to the OneBusAway API",
        unit: "ms",
        valueType: ValueType.DOUBLE,
      },
    )

    this.obaCacheHits = metricService.getCounter("onebusaway_cache_hits", {
      description: "Number of cache hits for OneBusAway requests",
      unit: "hits",
    })

    this.obaCacheMisses = metricService.getCounter("onebusaway_cache_misses", {
      description: "Number of cache misses for OneBusAway requests",
      unit: "misses",
    })
  }

  init(feedCode: string, config: OneBusAwayConfig) {
    this.logger = new Logger(`${OneBusAwayService.name}[${feedCode}]`)
    this.feedCode = feedCode

    this.obaSdk = new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 5,
      fetch: this.instrumentedFetch.bind(this),
    })
  }

  async healthCheck(): Promise<void> {
    await this.obaSdk.currentTime.retrieve()
  }

  private async instrumentedFetch(url: any, init?: any): Promise<any> {
    await this.obaRateLimiter.removeTokens(1)

    const methodName = new URL(url).pathname.split("/")[3].split(".")[0]

    this.obaRequestCounter.add(1, {
      feed_code: this.feedCode,
      method: methodName,
    })

    const start = Date.now()
    const resp = await fetch(url, init)
    const duration = Date.now() - start

    this.obaResponseCounter.add(1, {
      feed_code: this.feedCode,
      method: methodName,
      status: resp.status,
    })

    this.obaRequestDuration.record(duration, {
      feed_code: this.feedCode,
      method: methodName,
      status: resp.status,
    })

    return resp
  }

  private async cached<T>(
    key: string,
    fn: () => Promise<T | { value: T; ttl: number }>,
    ttl?: number,
  ): Promise<T> {
    const cacheKey = `${this.feedCode}-${key}`
    const cached = await this.cacheManager.get<T>(cacheKey)
    if (cached) {
      this.obaCacheHits.add(1, {
        feed_code: this.feedCode,
      })
      return cached
    }

    this.obaCacheMisses.add(1, {
      feed_code: this.feedCode,
    })

    const result = await fn()
    if (result instanceof Object && "value" in result && "ttl" in result) {
      this.cacheManager.set(cacheKey, result.value, result.ttl)
      return result.value
    }

    this.cacheManager.set(cacheKey, result, ttl)
    return result
  }

  async getAgencyBounds(): Promise<BBox> {
    return this.cached(
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

          const color = route.color?.replaceAll("#", "").trim() ?? null

          stopRoutes.push({
            routeId: route.id,
            name: route.shortName ?? "Unnamed Route",
            color: color?.trim() !== "" ? color : null,
            headsigns,
          })
        }

        return stopRoutes
      },
      86_400_000,
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
    return this.cached(
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
      86_400_000,
    )
  }

  async getStop(stopId: string): Promise<Stop> {
    return this.cached(
      `stop-${stopId}`,
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

        return {
          stopId: stop.data.entry.id,
          stopCode: stop.data.entry.code ?? null,
          name: stop.data.entry.name,
          lat: stop.data.entry.lat,
          lon: stop.data.entry.lon,
        }
      },
      86_400_000,
    )
  }

  async getArrivalsAndDeparturesForStop(
    stopId: string,
  ): Promise<OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null> {
    return this.cached(`arrivalsAndDepartures-${stopId}`, async () => {
      let resp: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse
      try {
        resp = await this.obaSdk.arrivalAndDeparture.list(stopId, {
          minutesBefore: 0,
          minutesAfter: 120,
        })
      } catch (e: any) {
        if (e?.error?.code === 404) {
          this.logger.warn(
            `getArrivalsAndDeparturesForStop: Requested stop ${stopId} not found`,
          )
          return { value: null, ttl: 3_600_000 }
        }

        throw new InternalServerErrorException(e)
      }

      let ttl = 18_000
      if (resp === null) {
        // doesn't support this stop, I guess? undocumented behavior
        ttl = 3_600_000
      } else if (resp.data.entry.arrivalsAndDepartures.length === 0) {
        // no arrivals for the next hour so we can cache for longer
        ttl = 300_000
      }

      return { value: resp, ttl }
    })
  }

  async getUpcomingTripsForRoutesAtStops(
    routes: RouteAtStop[],
  ): Promise<TripStop[]> {
    return this.cached(
      `upcomingTrips-${routes.map((r) => `${r.routeId}-${r.stopId}`).join(",")}`,
      async () => {
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

          if (!arrivalsAndDeparturesResp) {
            continue
          }

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

            const staticStop =
              arrivalsAndDeparturesResp.data.references.stops.find(
                (s) => s.id === stopId,
              )

            const staticRoute =
              arrivalsAndDeparturesResp.data.references.routes.find(
                (r) => r.id === ad.routeId,
              )

            const departureTime =
              ad.predicted && ad.predictedDepartureTime
                ? new Date(ad.predictedDepartureTime)
                : new Date(ad.scheduledDepartureTime)

            if (departureTime < new Date()) {
              continue
            }

            const arrivalTime =
              ad.predicted && ad.predictedArrivalTime
                ? new Date(ad.predictedArrivalTime)
                : new Date(ad.scheduledArrivalTime)

            const color = staticRoute?.color?.replaceAll("#", "").trim() ?? null

            tripStops.push({
              tripId: ad.tripId,
              stopId,
              routeId: ad.routeId,
              routeName: ad.routeShortName ?? "Unnamed Route",
              routeColor: color?.trim() !== "" ? color : null,
              stopName: staticStop?.name ?? "Unnamed Stop",
              headsign: ad.tripHeadsign,
              arrivalTime,
              departureTime,
              isRealtime: ad.predicted ?? false,
            })
          }
        }

        let ttl = 15_000
        if (tripStops.length === 0) {
          ttl = 300_000
        } else {
          const earliestArrival = Math.min(
            ...tripStops.map((ts) => ts.arrivalTime.getTime()),
          )

          if (earliestArrival > Date.now() + 300_000) {
            ttl = 30_000
          }
        }

        return { value: tripStops, ttl }
      },
    )
  }
}
