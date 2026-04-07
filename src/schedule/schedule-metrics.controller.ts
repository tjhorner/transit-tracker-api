import {
  Controller,
  Get,
  Header,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import { featureCollection, point } from "@turf/turf"
import ms from "ms"
import { InternalApiGuard } from "src/guards/internal-api.guard"
import { CacheTTL } from "src/modules/cache/decorators/cache-ttl.decorator"
import { CacheInterceptor } from "src/modules/cache/interceptors/cache.interceptor"
import { FeedService } from "src/modules/feed/feed.service"
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
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(ms("5m"))
  async getSubscriptionsGeojson(): Promise<any> {
    const subscriptions = await this.metricsService.getSubscriptions()

    let minStopSubscribers = 0
    let maxStopSubscribers = 0

    const totalSubscribersForStop: Record<string, number> = {}

    for (const subscription of subscriptions) {
      const uniqueStopIds = new Set()
      for (const route of subscription.routes) {
        const stopId = subscription.feedCode
          ? `${subscription.feedCode}:${route.stopId}`
          : route.stopId

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
      Object.keys(totalSubscribersForStop).map(async (stopId) => {
        const stop = await feedProvider.getStop(stopId).catch(() => null)
        if (!stop) {
          return null
        }

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
        })
      }),
    )

    return featureCollection(stops.filter((stop) => stop !== null))
  }
}
