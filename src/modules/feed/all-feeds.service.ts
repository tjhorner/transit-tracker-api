import * as Sentry from "@sentry/node"
import * as turf from "@turf/turf"
import { BBox } from "geojson"
import {
  FeedProviderNotFoundError,
  InvalidGlobalIdError,
  MismatchedFeedCodeError,
} from "./feed.errors"
import { FeedService } from "./feed.service"
import {
  FeedProvider,
  RouteAtStop,
  Stop,
  StopRoute,
  TripStop,
} from "./interfaces/feed-provider.interface"

type GlobalId = `${string}:${string}`

export class AllFeedsService implements FeedProvider {
  constructor(private readonly feedService: FeedService) {}

  private onAllProviders<T>(
    method: (feedCode: string, provider: FeedProvider) => Promise<T>,
  ): Promise<T[]> {
    const providers = Object.entries(this.feedService.getAllFeedProviders())
    return Promise.all(
      providers.map(([feedCode, provider]) => method(feedCode, provider)),
    )
  }

  /**
   * @throws {InvalidGlobalIdError} When the ID is not a `feedCode:id` pair.
   * @throws {FeedProviderNotFoundError} When no provider is registered for the feed code.
   */
  private fromGlobalId(id: string): {
    feedProvider: FeedProvider
    feedCode: string
    id: string
  } {
    const [feedCode, ...rest] = id.split(":")
    const idWithoutFeed = rest.join(":")
    if (!feedCode || !idWithoutFeed) {
      throw new InvalidGlobalIdError(id)
    }

    const provider = this.feedService.getFeedProvider(feedCode)
    if (!provider) {
      throw new FeedProviderNotFoundError(feedCode)
    }

    return { feedCode, feedProvider: provider, id: idWithoutFeed }
  }

  private toGlobalId(feedCode: string, id: string): GlobalId {
    return `${feedCode}:${id}`
  }

  healthCheck(): Promise<void> {
    return Promise.resolve()
  }

  /** @throws {MismatchedFeedCodeError} When a route and its stop come from different feeds. */
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
          throw new MismatchedFeedCodeError(routeStop.routeId, routeStop.stopId)
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
          throw new FeedProviderNotFoundError(feedCode)
        }

        const result = await Sentry.startSpan(
          {
            op: "function",
            name: `getUpcomingTripsForRoutesAtStops:${feedCode}`,
            attributes: {
              feed_code: feedCode,
              route_stops: JSON.stringify(routeStops),
            },
          },
          async () => {
            return await provider.getUpcomingTripsForRoutesAtStops(routeStops)
          },
        )

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

  async getStop(stopId: string): Promise<Stop> {
    const {
      feedCode,
      feedProvider,
      id: stopIdWithoutFeed,
    } = this.fromGlobalId(stopId)

    const stop = await feedProvider.getStop(stopIdWithoutFeed)
    return {
      ...stop,
      stopId: this.toGlobalId(feedCode, stop.stopId),
    }
  }

  async getRoutesForStop(stopId: string): Promise<StopRoute[]> {
    const {
      feedProvider,
      feedCode,
      id: stopIdWithoutFeed,
    } = this.fromGlobalId(stopId)

    const routes = await feedProvider.getRoutesForStop(stopIdWithoutFeed)
    return routes.map((route) => ({
      ...route,
      routeId: this.toGlobalId(feedCode, route.routeId),
    }))
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
    const serviceArea = await this.onAllProviders(async (feedCode) =>
      this.feedService.getServiceArea(feedCode),
    )

    const allBounds = turf.bbox(turf.featureCollection(serviceArea))

    return allBounds
  }
}
