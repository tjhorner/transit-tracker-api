import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager"
import { Inject, Injectable, Optional } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Counter, Histogram, ValueType } from "@opentelemetry/api"
import { MetricService } from "nestjs-otel"
import type { FeedContext } from "../../interfaces/feed-provider.interface"

@Injectable()
export class FeedCacheService {
  private readonly feedCode: string
  private readonly cacheHitsMetric?: Counter
  private readonly cacheMissesMetric?: Counter
  private readonly cacheTtlMetric?: Histogram

  private readonly pendingCache = new Map<string, Promise<any>>()

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(REQUEST) { feedCode }: FeedContext,
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

  async cached<T>(
    key: string,
    fn: () => Promise<T | { value: T; ttl: number }>,
    ttl?: number,
  ): Promise<T> {
    if (this.pendingCache.has(key)) {
      return this.pendingCache.get(key)!
    }

    const getValue = async () => {
      const cacheKey = `${this.feedCode}-${key}`
      const cached = await this.cacheManager.get<T>(cacheKey)
      if (cached) {
        this.cacheHitsMetric?.add(1, {
          feed_code: this.feedCode,
        })
        return cached
      }

      this.cacheMissesMetric?.add(1, {
        feed_code: this.feedCode,
      })

      const result = await fn()
      if (result instanceof Object && "value" in result && "ttl" in result) {
        if (result.ttl > 0) {
          this.cacheManager.set(cacheKey, result.value, result.ttl)
        }

        this.cacheTtlMetric?.record(result.ttl, {
          feed_code: this.feedCode,
        })

        return result.value
      }

      this.cacheManager.set(cacheKey, result, ttl)

      this.cacheTtlMetric?.record(ttl ?? 0, {
        feed_code: this.feedCode,
      })

      return result
    }

    const promise = getValue()
    this.pendingCache.set(key, promise)

    try {
      return await promise
    } finally {
      this.pendingCache.delete(key)
    }
  }
}
