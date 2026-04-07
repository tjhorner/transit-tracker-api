import { Controller, Get, Header, UseGuards } from "@nestjs/common"
import { featureCollection, point } from "@turf/turf"
import { InternalApiGuard } from "src/guards/internal-api.guard"
import { FeedService } from "src/modules/feed/feed.service"
import { StopRoute } from "src/modules/feed/interfaces/feed-provider.interface"
import { ScheduleMetricsService } from "./schedule-metrics.service"

@Controller("schedule-metrics")
@UseGuards(InternalApiGuard)
export class ScheduleMetricsController {
  constructor(
    private readonly feedService: FeedService,
    private readonly metricsService: ScheduleMetricsService,
  ) {}

  @Get("subscriptions.geojson")
  @Header("Content-Type", "application/vnd.geo+json")
  async getSubscriptionsGeojson(): Promise<any> {
    const subscriptions = await this.metricsService.getSubscriptions()

    let minStopSubscribers = 0
    let maxStopSubscribers = 0

    const stopsToRoutes: Record<string, Record<string, number>> = {}
    const totalSubscribersForStop: Record<string, number> = {}

    for (const subscription of subscriptions) {
      const uniqueStopIds = new Set()
      for (const route of subscription.routes) {
        const routeId = subscription.feedCode
          ? `${subscription.feedCode}:${route.routeId}`
          : route.routeId
        const stopId = subscription.feedCode
          ? `${subscription.feedCode}:${route.stopId}`
          : route.stopId

        if (!stopsToRoutes[stopId]) {
          stopsToRoutes[stopId] = {}
        }
        stopsToRoutes[stopId][routeId] =
          (stopsToRoutes[stopId][routeId] ?? 0) + 1

        if (!uniqueStopIds.has(stopId)) {
          totalSubscribersForStop[stopId] =
            (totalSubscribersForStop[stopId] ?? 0) + 1
          uniqueStopIds.add(stopId)

          minStopSubscribers = Math.min(
            minStopSubscribers,
            totalSubscribersForStop[stopId],
          )
          maxStopSubscribers = Math.max(
            maxStopSubscribers,
            totalSubscribersForStop[stopId],
          )
        }
      }
    }

    const feedProvider = this.feedService.all
    const stops = await Promise.all(
      Object.keys(stopsToRoutes).map(async (stopId) => {
        const stop = await feedProvider.getStop(stopId).catch(() => null)
        if (!stop) {
          return null
        }

        const routes: StopRoute[] = await feedProvider
          .getRoutesForStop(stopId)
          .catch(() => [])

        const subscriberCount = totalSubscribersForStop[stopId] || 0

        const ratio =
          maxStopSubscribers > 0 ? subscriberCount / maxStopSubscribers : 0

        const color = `#${Math.round(255 * ratio)
          .toString(16)
          .padStart(2, "0")}00${Math.round(255 * (1 - ratio))
          .toString(16)
          .padStart(2, "0")}`

        return point([stop?.lon, stop?.lat], {
          id: stopId,
          name: stop.name,
          subscriberCount,
          "marker-color": color,
          routes: routes.map((route) => ({
            id: route.routeId,
            name: route.name,
            subscriberCount: stopsToRoutes[stopId][route.routeId] || 0,
          })),
        })
      }),
    )

    return featureCollection(stops.filter((stop) => stop !== null))
  }
}
