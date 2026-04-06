import {
  forwardRef,
  Inject,
  Injectable,
  OnApplicationShutdown,
  Scope,
} from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Counter, Histogram } from "@opentelemetry/api"
import { IDatabaseConnection } from "@pgtyped/runtime"
import { MetricService } from "nestjs-otel"
import { Pool, PoolClient } from "pg"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { PG_POOL } from "./const"

export const GTFS_TABLES = [
  "frequencies",
  "stop_times",
  "trips",
  "stops",
  "routes",
  "calendar_dates",
  "calendar",
  "agency",
  "feed_info",
] as const

@Injectable({ scope: Scope.REQUEST })
export class GtfsDbService
  implements IDatabaseConnection, OnApplicationShutdown
{
  private readonly feedCode: string
  private readonly queryCounter: Counter
  private readonly queryDuration: Histogram

  constructor(
    @Inject(forwardRef(() => PG_POOL)) private readonly pool: Pool,
    @Inject(REQUEST) { feedCode }: FeedContext,
    private readonly metricService: MetricService,
  ) {
    this.feedCode = feedCode

    this.queryCounter = this.metricService.getCounter("gtfs_db_query_count", {
      description: "Total number of GTFS DB queries executed per feed",
      unit: "queries",
    })

    this.queryDuration = this.metricService.getHistogram(
      "gtfs_db_query_duration",
      {
        description: "Duration of GTFS DB queries executed per feed",
        unit: "ms",
      },
    )
  }

  async onApplicationShutdown() {
    await this.pool.end()
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()

    try {
      await client.query("BEGIN")
      const result = await fn(client)
      await client.query("COMMIT")
      return result
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

  async query(
    query: string,
    bindings: any[],
  ): Promise<{
    rows: any[]
    rowCount: number
  }> {
    for (const table of GTFS_TABLES) {
      // ugly hack to force partitioned table usage
      query = query.replaceAll(`"${table}"`, `"${table}__${this.feedCode}"`)
    }

    this.queryCounter.add(1, { feed_code: this.feedCode })

    const start = Date.now()
    const result = await (this.pool.query(query, bindings) as Promise<any>)

    const duration = Date.now() - start
    this.queryDuration.record(duration, { feed_code: this.feedCode })

    return result
  }

  obtainConnection(): Promise<PoolClient> {
    return this.pool.connect()
  }
}
