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
  private readonly subscribersByFeedCode: Map<string, number> = new Map()
  private readonly routeStopMetrics: Map<string, RouteStopMetric> = new Map()

  constructor(feedService: FeedService, metricService: MetricService) {
    this.subscribersByFeedCode = new Map<string, number>(
      Object.keys(feedService.getAllFeeds()).map((feed) => [feed, 0]),
    )

    metricService
      .getObservableGauge("schedule_subscriptions", {
        description: "Number of active schedule subscriptions per feed",
        unit: "subscriptions",
      })
      .addCallback((observable) => {
        for (const [feedCode, count] of this.subscribersByFeedCode) {
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
    this.incrementFeedCodeMetrics(1, subscription)
  }

  remove(subscription: ScheduleOptions) {
    if (!this.subscribers.has(subscription)) {
      return
    }

    this.subscribers.delete(subscription)
    this.incrementRouteStopMetrics(-1, subscription)
    this.incrementFeedCodeMetrics(-1, subscription)
  }

  private incrementFeedCodeMetrics(
    value: number,
    subscription: ScheduleOptions,
  ) {
    const feedCodes: Set<string> = new Set()

    if (subscription.feedCode) {
      feedCodes.add(subscription.feedCode)
    } else {
      for (const { routeId } of subscription.routes) {
        const [feedCode] = routeId.split(":")
        feedCodes.add(feedCode)
      }
    }

    for (const feedCode of feedCodes) {
      const currentCount = this.subscribersByFeedCode.get(feedCode) ?? 0
      this.subscribersByFeedCode.set(
        feedCode,
        Math.max(0, currentCount + value),
      )
    }
  }

  private incrementRouteStopMetrics(
    value: number,
    { feedCode, routes }: ScheduleOptions,
  ) {
    feedCode = feedCode ?? "all"
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
