import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common"
import Redis from "ioredis"
import { MetricService } from "nestjs-otel"
import { hostname } from "os"
import { REDIS_CLIENT } from "src/modules/cache/cache.module"
import { FeedService } from "src/modules/feed/feed.service"
import { ScheduleOptions } from "./schedule.service"

const REDIS_KEY_PREFIX = "schedule_subscribers"
const HEARTBEAT_INTERVAL_MS = 30_000
const KEY_TTL_SECONDS = 60

@Injectable()
export class ScheduleMetricsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ScheduleMetricsService.name)
  private readonly subscribers: Set<ScheduleOptions> = new Set()
  private subscribersByFeedCode: Map<string, number> = new Map()
  private readonly instanceKey = `${REDIS_KEY_PREFIX}:${hostname()}`
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly feedService: FeedService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
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

    if (this.redis) {
      this.heartbeatTimer = setInterval(() => {
        this.refreshTtl()
      }, HEARTBEAT_INTERVAL_MS)

      this.refreshTtl()
    }
  }

  async onApplicationShutdown() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    if (this.redis) {
      await this.redis.del(this.instanceKey).catch((err) => {
        this.logger.warn(`Failed to clean up Redis key on shutdown: ${err}`)
      })
    }
  }

  add(subscription: ScheduleOptions) {
    this.subscribers.add(subscription)
    this.incrementFeedCodeMetrics(1, subscription)
    this.incrementGlobalCount(1, subscription)
  }

  remove(subscription: ScheduleOptions) {
    if (!this.subscribers.has(subscription)) {
      return
    }

    this.subscribers.delete(subscription)
    this.incrementFeedCodeMetrics(-1, subscription)
    this.incrementGlobalCount(-1, subscription)
  }

  async getSubscriberCounts(): Promise<Record<string, number>> {
    if (!this.redis) {
      return {}
    }

    const keys: string[] = []
    let cursor = "0"
    do {
      const [nextCursor, matchedKeys] = await this.redis.scan(
        cursor,
        "MATCH",
        `${REDIS_KEY_PREFIX}:*`,
        "COUNT",
        100,
      )
      cursor = nextCursor
      keys.push(...matchedKeys)
    } while (cursor !== "0")

    const totals: Record<string, number> = {}

    for (const key of keys) {
      const fields = await this.redis.hgetall(key)
      for (const [field, value] of Object.entries(fields)) {
        const count = parseInt(value, 10)
        if (!isNaN(count)) {
          totals[field] = (totals[field] ?? 0) + count
        }
      }
    }

    return totals
  }

  private incrementGlobalCount(value: number, subscription: ScheduleOptions) {
    if (!this.redis) {
      return
    }

    const fields = this.getRouteStopFields(subscription)
    const pipeline = this.redis.pipeline()
    for (const field of fields) {
      pipeline.hincrby(this.instanceKey, field, value)
    }
    pipeline.expire(this.instanceKey, KEY_TTL_SECONDS)
    pipeline.exec().catch((err) => {
      this.logger.warn(`Failed to update Redis subscriber counts: ${err}`)
    })
  }

  private refreshTtl() {
    this.redis?.expire(this.instanceKey, KEY_TTL_SECONDS).catch((err) => {
      this.logger.warn(`Failed to refresh Redis TTL: ${err}`)
    })
  }

  private getRouteStopFields(subscription: ScheduleOptions): string[] {
    if (!subscription.feedCode) {
      return subscription.routes.map(
        (r) =>
          `${encodeURIComponent(r.routeId)},${encodeURIComponent(r.stopId)}`,
      )
    }

    const { feedCode } = subscription
    return subscription.routes.map(
      (r) =>
        `${encodeURIComponent(`${feedCode}:${r.routeId}`)},${encodeURIComponent(`${feedCode}:${r.stopId}`)}`,
    )
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
