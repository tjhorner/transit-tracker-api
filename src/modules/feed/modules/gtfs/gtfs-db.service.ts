import { forwardRef, Inject, Injectable, Scope } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { IDatabaseConnection } from "@pgtyped/runtime"
import { Pool, PoolClient } from "pg"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { PG_POOL } from "./gtfs.module"

@Injectable({ scope: Scope.REQUEST })
export class GtfsDbService implements IDatabaseConnection {
  private readonly feedCode: string

  constructor(
    @Inject(forwardRef(() => PG_POOL)) private readonly pool: Pool,
    @Inject(REQUEST) { feedCode }: FeedContext,
  ) {
    this.feedCode = feedCode
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()

    try {
      await client.query("BEGIN")
      await client.query("SET LOCAL ROLE gtfs")
      await client.query(`SET LOCAL app.current_feed = '${this.feedCode}'`)
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
    return this.tx(
      async (client) => client.query(query, bindings) as Promise<any>,
    )
  }
}
