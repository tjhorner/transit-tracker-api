import { Inject, Injectable, Optional, Scope } from "@nestjs/common"
import { Counter, Histogram, ValueType } from "@opentelemetry/api"
import { SentryTraced } from "@sentry/nestjs"
import * as Sentry from "@sentry/node"
import { Cacheable } from "cacheable"
import ms from "ms"
import { MetricService } from "nestjs-otel"
import { DeepReadonly } from "ts-essentials"
import { FEED_CONTEXT } from "../../feed-context"
import type { FeedContext } from "../../interfaces/feed-provider.interface"

const MIN_TTL_FOR_JITTER_MS = ms("1h")
const TTL_JITTER_RATIO = 0.1

/** Spreads out long TTLs so entries filled together don't all expire together (prevents query storms) */
function withExpiryJitter(ttl: number | undefined): number | undefined {
  if (ttl === undefined || ttl < MIN_TTL_FOR_JITTER_MS) {
    return ttl
  }

  const jitterFactor = 1 + (Math.random() * 2 - 1) * TTL_JITTER_RATIO
  return Math.round(ttl * jitterFactor)
}

@Injectable({ scope: Scope.REQUEST })
export class FeedCacheService {
  private readonly feedCode: string
  private readonly cacheHitsMetric?: Counter
  private readonly cacheMissesMetric?: Counter
  private readonly cacheTtlMetric?: Histogram

  private readonly pendingCache = new Map<string, Promise<any>>()

  constructor(
    private readonly cacheManager: Cacheable,
    @Inject(FEED_CONTEXT) { feedCode }: FeedContext,
    @Optional() metricService?: MetricService,
  ) {
    this.feedCode = feedCode

    this.cacheHitsMetric = metricService?.getCounter("feed_cache_hits", {
      description: "Number of cache hits for a specified feed",
      unit: "hits",
    })

    this.cacheMissesMetric = metricService?.getCounter("feed_cache_misses", {
      description: "Number of cache misses for a specified feed",
      unit: "misses",
    })

    this.cacheTtlMetric = metricService?.getHistogram("feed_cache_ttl", {
      description: "Cache TTL for a specified feed",
      unit: "ms",
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [
          0, 1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000, 1200000,
          3000000, 6000000, 86400000,
        ],
      },
    })
  }

  @SentryTraced()
  async cached<T>(
    key: string,
    fn: () => Promise<T | { value: T; ttl: number }>,
    ttl?: number,
  ): Promise<DeepReadonly<T>> {
    const span = Sentry.getActiveSpan()
    if (span) {
      Sentry.updateSpanName(span, `cached ${key}`)
      span.setAttribute("cache.key", key)
      span.setAttribute("cache.feed_code", this.feedCode)
    }

    if (this.pendingCache.has(key)) {
      return this.pendingCache.get(key)!
    }

    const getValue = async () => {
      const cacheKey = `${this.feedCode}-${key}`
      const cached = await this.cacheManager.get<T>(cacheKey)
      if (cached !== undefined) {
        span?.setAttribute("cache.hit", true)
        this.cacheHitsMetric?.add(1, {
          feed_code: this.feedCode,
        })
        return cached
      }

      span?.setAttribute("cache.hit", false)
      this.cacheMissesMetric?.add(1, {
        feed_code: this.feedCode,
      })

      const result = await fn()
      if (result instanceof Object && "value" in result && "ttl" in result) {
        if (result.ttl > 0) {
          this.cacheManager.set(
            cacheKey,
            result.value,
            withExpiryJitter(result.ttl),
          )
        }

        this.cacheTtlMetric?.record(result.ttl, {
          feed_code: this.feedCode,
        })

        return result.value
      }

      this.cacheManager.set(cacheKey, result, withExpiryJitter(ttl))

      this.cacheTtlMetric?.record(ttl ?? 0, {
        feed_code: this.feedCode,
      })

      return result
    }

    const promise = getValue().finally(() => this.pendingCache.delete(key))
    this.pendingCache.set(key, promise)

    return promise as Promise<DeepReadonly<T>>
  }
}
