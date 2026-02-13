import { forwardRef, Inject, Injectable, Logger, Scope } from "@nestjs/common"
import { MetricService } from "nestjs-otel"
import { Pool } from "pg"
import { PG_POOL } from "./gtfs.module"
import { getFeedSizes } from "./queries/get-feed-sizes.queries"

@Injectable({ scope: Scope.DEFAULT })
export class GtfsMetricsService {
  private readonly logger = new Logger(GtfsMetricsService.name)
  private active = false

  constructor(
    @Inject(forwardRef(() => PG_POOL)) private readonly pool: Pool,
    private readonly metricService: MetricService,
  ) {}

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
        const conn = await this.pool.connect()

        try {
          const res = await getFeedSizes.run(undefined, conn)
          for (const row of res) {
            observable.observe(row.size_mb, {
              feed_code: row.feed_code,
              table: row.table_name,
            })
          }
        } finally {
          conn.release()
        }
      })
  }
}
