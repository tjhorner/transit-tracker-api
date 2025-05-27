import {
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Counter, Histogram, ValueType } from "@opentelemetry/api"
import * as Sentry from "@sentry/node"
import * as turf from "@turf/turf"
import { BBox } from "geojson"
import { RateLimiter } from "limiter"
import ms from "ms"
import { MetricService } from "nestjs-otel"
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
  private feedCode: string
  private config: Readonly<OneBusAwayConfig>
  private obaSdk: OnebusawaySDK
  private obaRateLimiter = new RateLimiter({
    tokensPerInterval: 1,
    interval: 200,
  })

  private obaRequestCounter: Counter
  private obaResponseCounter: Counter
  private obaRequestDuration: Histogram

  constructor(
    @Inject(REQUEST) { feedCode, config }: FeedContext<OneBusAwayConfig>,
    private readonly cache: FeedCacheService,
    metricService: MetricService,
  ) {
    this.logger = new Logger(`${OneBusAwayService.name}[${feedCode}]`)
    this.feedCode = feedCode
    this.config = config

    config = OneBusAwayConfigSchema.parse(config)

    this.obaSdk = new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 5,
      fetch: this.instrumentedFetch.bind(this),
    })

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
  }

  async healthCheck(): Promise<void> {
    await this.obaSdk.currentTime.retrieve()
  }

  async getMetadata(): Promise<Record<string, any>> {
    return this.cache.cached(
      "metadata",
      async () => {
        const obaConfig = await this.obaSdk.config.retrieve()

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

  private async instrumentedFetch(url: any, init?: any): Promise<any> {
    await Sentry.startSpan(
      {
        op: "throttle.wait",
        name: "obaRateLimiter",
      },
      async (span) => {
        const remainingTokens = await this.obaRateLimiter.removeTokens(1)
        span.setAttribute("throttle.remaining_tokens", remainingTokens)
      },
    )

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
          if (e.code === 404) {
            throw new NotFoundException(`Stop ${stopId} not found`)
          }

          throw new InternalServerErrorException(e)
        }

        if (stop === null) {
          throw new NotFoundException(`Stop ${stopId} not found`)
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
      ms("24h"),
    )
  }

  async getArrivalsAndDeparturesForStop(
    stopId: string,
  ): Promise<OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null> {
    return this.cache.cached(`arrivalsAndDepartures-${stopId}`, async () => {
      let resp: OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null
      try {
        resp = (await this.obaSdk.arrivalAndDeparture.list(stopId, {
          minutesBefore: 0,
          minutesAfter: 120,
        })) as OnebusawaySDK.ArrivalAndDeparture.ArrivalAndDepartureListResponse | null
      } catch (e: any) {
        if (e?.error?.code === 404) {
          this.logger.warn(
            `getArrivalsAndDeparturesForStop: Requested stop ${stopId} not found`,
          )
          return { value: null, ttl: ms("1h") }
        }

        throw new InternalServerErrorException(e)
      }

      let ttl = ms("30s")
      if (resp === null) {
        // doesn't support this stop, I guess? undocumented behavior
        ttl = ms("1h")
      } else if (resp.data.entry.arrivalsAndDepartures.length === 0) {
        // no arrivals for the next two hours so we can cache for longer
        ttl = ms("2h")
      } else {
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
      }

      return { value: resp, ttl }
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

        const staticStop = arrivalsAndDeparturesResp.data.references.stops.find(
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
          headsign: this.removeRouteNameFromHeadsign(
            ad.routeShortName,
            ad.tripHeadsign,
          ),
          arrivalTime,
          departureTime,
          isRealtime: ad.predicted ?? false,
        })
      }
    }

    return tripStops
  }
}
