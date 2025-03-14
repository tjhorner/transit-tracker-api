import { Injectable } from "@nestjs/common"
import { MetricService } from "nestjs-otel"
import { FeedService } from "src/modules/feed/feed.service"
import { ScheduleOptions } from "./schedule.service"

interface RouteStopMetric {
  feedCode: string
  routeId: string
  stopId: string
  count: number
}

@Injectable()
export class ScheduleMetricsService {
  private readonly subscribers: Set<ScheduleOptions> = new Set()
  private readonly routeStopMetrics: Map<string, RouteStopMetric> = new Map()

  constructor(feedService: FeedService, metricService: MetricService) {
    metricService
      .getObservableGauge("schedule_subscriptions", {
        description: "Number of active schedule subscriptions per feed",
        unit: "subscriptions",
      })
      .addCallback((observable) => {
        const subscribersByFeedCode = new Map<string, number>(
          Object.keys(feedService.getAllFeeds()).map((feed) => [feed, 0]),
        )

        this.subscribers.forEach((subscription) => {
          const count = subscribersByFeedCode.get(subscription.feedCode) ?? 0
          subscribersByFeedCode.set(subscription.feedCode, count + 1)
        })

        for (const [feedCode, count] of subscribersByFeedCode) {
          observable.observe(count, { feed_code: feedCode })
        }
      })

    metricService
      .getObservableGauge("route_stop_subscriptions", {
        description: "Number of active subscriptions for a route-stop pair",
        unit: "subscriptions",
      })
      .addCallback((observable) => {
        for (const [key, value] of this.routeStopMetrics) {
          observable.observe(value.count, {
            feed_code: value.feedCode,
            route_id: value.routeId,
            stop_id: value.stopId,
          })

          if (value.count === 0) {
            this.routeStopMetrics.delete(key)
          }
        }
      })
  }

  add(subscription: ScheduleOptions) {
    this.subscribers.add(subscription)
    this.incrementRouteStopMetrics(1, subscription)
  }

  remove(subscription: ScheduleOptions) {
    if (!this.subscribers.has(subscription)) {
      return
    }

    this.subscribers.delete(subscription)
    this.incrementRouteStopMetrics(-1, subscription)
  }

  private incrementRouteStopMetrics(
    value: number,
    { feedCode, routes }: ScheduleOptions,
  ) {
    for (const routeStopPair of routes) {
      const key = `${feedCode}:${routeStopPair.routeId}:${routeStopPair.stopId}`
      const metric = this.routeStopMetrics.get(key) ?? {
        feedCode,
        routeId: routeStopPair.routeId,
        stopId: routeStopPair.stopId,
        count: 0,
      }

      metric.count += value
      this.routeStopMetrics.set(key, metric)
    }
  }
}
