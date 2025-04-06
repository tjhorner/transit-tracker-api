import { BBox } from "geojson"
import { FeedService } from "./feed.service"
import {
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "./interfaces/feed-provider.interface"
import * as turf from "@turf/turf"

type GlobalId = `${string}:${string}`

export class AllFeedsService implements FeedProvider<never> {
  constructor(private readonly feedService: FeedService) {}

  private onAllProviders<T>(
    method: (feedCode: string, provider: FeedProvider) => Promise<T>,
  ): Promise<T[]> {
    const providers = Object.entries(this.feedService.getAllFeedProviders())
    return Promise.all(
      providers.map(([feedCode, provider]) => method(feedCode, provider)),
    )
  }

  private fromGlobalId(id: string): {
    feedProvider: FeedProvider
    feedCode: string
    id: string
  } {
    const [feedCode, ...rest] = id.split(":")
    const idWithoutFeed = rest.join(":")
    if (!feedCode || !idWithoutFeed) {
      throw new Error(`Invalid global ID: ${id}`)
    }

    const provider = this.feedService.getFeedProvider(feedCode)
    if (!provider) {
      throw new Error(`No provider found for feed code ${feedCode}`)
    }

    return { feedCode, feedProvider: provider, id: idWithoutFeed }
  }

  private toGlobalId(feedCode: string, id: string): GlobalId {
    return `${feedCode}:${id}`
  }

  init(): void {}

  healthCheck(): Promise<void> {
    return Promise.resolve()
  }

  async getUpcomingTripsForRoutesAtStops(
    routeStops: RouteAtStop[],
  ): Promise<TripStop[]> {
    const routeStopsByFeed = routeStops.reduce(
      (acc, routeStop) => {
        const { feedCode: stopIdFeedCode, id: stopId } = this.fromGlobalId(
          routeStop.stopId,
        )

        const { feedCode: routeIdFeedCode, id: routeId } = this.fromGlobalId(
          routeStop.routeId,
        )

        if (stopIdFeedCode !== routeIdFeedCode) {
          throw new Error(
            `Route and stop IDs must have the same feed code: ${routeStop.routeId} and ${routeStop.stopId}`,
          )
        }

        const feedCode = stopIdFeedCode
        if (!acc[feedCode]) {
          acc[feedCode] = []
        }

        acc[feedCode].push({
          stopId,
          routeId,
        })

        return acc
      },
      {} as Record<string, RouteAtStop[]>,
    )

    const trips = await Promise.all(
      Object.entries(routeStopsByFeed).map(async ([feedCode, routeStops]) => {
        const provider = this.feedService.getFeedProvider(feedCode)
        if (!provider) {
          throw new Error(`No provider found for feed code ${feedCode}`)
        }

        const result =
          await provider.getUpcomingTripsForRoutesAtStops(routeStops)

        return result.map((trip) => ({
          ...trip,
          tripId: this.toGlobalId(feedCode, trip.tripId),
          routeId: this.toGlobalId(feedCode, trip.routeId),
          stopId: this.toGlobalId(feedCode, trip.stopId),
        }))
      }),
    )

    return trips.flat()
  }

  listStops(): Promise<Stop[]> {
    throw new Error("Method not implemented.")
  }

  getStop(stopId: string): Promise<Stop> {
    const {
      feedCode,
      feedProvider,
      id: stopIdWithoutFeed,
    } = this.fromGlobalId(stopId)

    return feedProvider.getStop(stopIdWithoutFeed).then((stop) => ({
      ...stop,
      stopId: this.toGlobalId(feedCode, stop.stopId),
    }))
  }

  getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    const {
      feedProvider,
      feedCode,
      id: stopIdWithoutFeed,
    } = this.fromGlobalId(stopId)

    return feedProvider.getRoutesForStop(stopIdWithoutFeed).then((routes) =>
      routes.map((route) => ({
        ...route,
        routeId: this.toGlobalId(feedCode, route.routeId),
      })),
    )
  }

  async getStopsInArea(bbox: BBox): Promise<Stop[]> {
    const providersInBounds =
      await this.feedService.getFeedProvidersInBounds(bbox)

    return Promise.all(
      providersInBounds.map(async ({ feedCode, provider }) => {
        const stops = await provider.getStopsInArea(bbox)
        return stops.map((stop) => ({
          ...stop,
          stopId: this.toGlobalId(feedCode, stop.stopId),
        }))
      }),
    ).then((results) => results.flat())
  }

  async getAgencyBounds(): Promise<BBox> {
    const bounds = await this.onAllProviders(async (_, provider) =>
      provider.getAgencyBounds(),
    )

    const allBounds = turf.bbox(
      turf.featureCollection(bounds.map((b) => turf.bboxPolygon(b))),
    )

    return allBounds
  }
}
