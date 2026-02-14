import { forwardRef, Inject, Injectable, Logger, Scope } from "@nestjs/common"
import { MetricService } from "nestjs-otel"
import { Pool } from "pg"
import { PG_POOL } from "./gtfs.module"
import { getFeedSizes, IGetFeedSizesResult } from "./queries/get-feed-sizes.queries"
import { Cacheable } from "cacheable"

@Injectable({ scope: Scope.DEFAULT })
export class GtfsMetricsService {
  private readonly logger = new Logger(GtfsMetricsService.name)
  private active = false

  constructor(
    @Inject(forwardRef(() => PG_POOL)) private readonly pool: Pool,
    private readonly metricService: MetricService,
    private readonly cacheManager: Cacheable,
  ) {}

  private async getFeedSizes(): Promise<IGetFeedSizesResult[]> {
    const cacheKey = "gtfsFeedSizes"
    const cached = await this.cacheManager.get<IGetFeedSizesResult[]>(cacheKey)
    if (cached) {
      return cached
    }

    const conn = await this.pool.connect()
    try {
      const res = await getFeedSizes.run(undefined, conn)
      await this.cacheManager.set(cacheKey, res, "5m")
      return res
    } finally {
      conn.release()
    }
  }

  activate() {
    if (this.active) {
      return
    }

    this.active = true
    this.logger.log("GTFS metrics active")

    this.metricService
      .getObservableGauge("gtfs_table_size_mb", {
        description: "Size of each GTFS table per feed",
        unit: "megabytes",
      })
      .addCallback(async (observable) => {
        const sizes = await this.getFeedSizes()
        for (const row of sizes) {
          observable.observe(row.size_mb, {
            feed_code: row.feed_code,
            table: row.table_name,
          })
        }
      })
  }
}
