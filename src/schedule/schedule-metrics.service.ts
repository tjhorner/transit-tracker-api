import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from "@nestjs/common"
import { randomUUID } from "crypto"
import Redis from "ioredis"
import { MetricService } from "nestjs-otel"
import { hostname } from "os"
import { REDIS_CLIENT } from "src/modules/cache/cache.module"
import { FeedService } from "src/modules/feed/feed.service"
import { ScheduleOptions } from "./schedule.service"

const REDIS_KEY_PREFIX = "schedule_subscriptions"
const HEARTBEAT_INTERVAL_MS = 30_000
const KEY_TTL_SECONDS = 60

@Injectable()
export class ScheduleMetricsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ScheduleMetricsService.name)
  private readonly subscriptionHandles: Map<ScheduleOptions, string> = new Map()
  private subscribersByFeedCode: Map<string, number> = new Map()
  private readonly instanceKey = `${REDIS_KEY_PREFIX}:${hostname()}`
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly feedService: FeedService,
    metricService: MetricService,
    @Inject(REDIS_CLIENT) @Optional() private readonly redis?: Redis,
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
    const handle = randomUUID()
    this.subscriptionHandles.set(subscription, handle)
    this.incrementFeedCodeMetrics(1, subscription)
    this.syncToRedis("add", handle, subscription)
  }

  remove(subscription: ScheduleOptions) {
    const handle = this.subscriptionHandles.get(subscription)
    if (!handle) {
      return
    }

    this.subscriptionHandles.delete(subscription)
    this.incrementFeedCodeMetrics(-1, subscription)
    this.syncToRedis("remove", handle)
  }

  async getSubscriptions(): Promise<ScheduleOptions[]> {
    if (!this.redis) {
      return []
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

    const subscriptions: ScheduleOptions[] = []

    for (const key of keys) {
      const fields = await this.redis.hgetall(key)
      for (const value of Object.values(fields)) {
        try {
          subscriptions.push(JSON.parse(value))
        } catch {
          // skip malformed entries
        }
      }
    }

    return subscriptions
  }

  private syncToRedis(
    action: "add" | "remove",
    handle: string,
    subscription?: ScheduleOptions,
  ) {
    if (!this.redis) {
      return
    }

    const pipeline = this.redis.pipeline()

    if (action === "add") {
      pipeline.hset(this.instanceKey, handle, JSON.stringify(subscription))
    } else {
      pipeline.hdel(this.instanceKey, handle)
    }

    pipeline.expire(this.instanceKey, KEY_TTL_SECONDS)
    pipeline.exec().catch((err) => {
      this.logger.warn(`Failed to update Redis subscriptions: ${err}`)
    })
  }

  private refreshTtl() {
    this.redis?.expire(this.instanceKey, KEY_TTL_SECONDS).catch((err) => {
      this.logger.warn(`Failed to refresh Redis TTL: ${err}`)
    })
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
