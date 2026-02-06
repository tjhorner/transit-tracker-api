import { Injectable, OnApplicationBootstrap } from "@nestjs/common"
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
export class ScheduleMetricsService implements OnApplicationBootstrap {
  private readonly subscribers: Set<ScheduleOptions> = new Set()
  private subscribersByFeedCode: Map<string, number> = new Map()

  constructor(
    private readonly feedService: FeedService,
    metricService: MetricService,
  ) {
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
  }

  onApplicationBootstrap() {
    this.subscribersByFeedCode = new Map<string, number>(
      Object.keys(this.feedService.getAllFeeds()).map((feed) => [feed, 0]),
    )
  }

  add(subscription: ScheduleOptions) {
    this.subscribers.add(subscription)
    this.incrementFeedCodeMetrics(1, subscription)
  }

  remove(subscription: ScheduleOptions) {
    if (!this.subscribers.has(subscription)) {
      return
    }

    this.subscribers.delete(subscription)
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
      const currentCount = this.subscribersByFeedCode.get(feedCode)
      if (currentCount === undefined) {
        continue
      }

      this.subscribersByFeedCode.set(
        feedCode,
        Math.max(0, currentCount + value),
      )
    }
  }
}
