import { forwardRef, Inject, Injectable, Scope } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { IDatabaseConnection } from "@pgtyped/runtime"
import { Pool, PoolClient } from "pg"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { IMPORT_PG_POOL, PG_POOL } from "./gtfs.module"

@Injectable({ scope: Scope.REQUEST })
export class GtfsDbService implements IDatabaseConnection {
  private readonly feedCode: string

  constructor(
    @Inject(forwardRef(() => PG_POOL)) private readonly pool: Pool,
    @Inject(forwardRef(() => IMPORT_PG_POOL)) private readonly importPool: Pool,
    @Inject(REQUEST) { feedCode }: FeedContext,
  ) {
    this.feedCode = feedCode
  }

  async query(
    query: string,
    bindings: any[],
  ): Promise<{
    rows: any[]
    rowCount: number
  }> {
    const client = await this.pool.connect()
    return this.tx(
      client,
      async (client) => client.query(query, bindings) as Promise<any>,
    )
  }

  async importTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.importPool.connect()
    return this.tx(client, fn)
  }

  private async tx<T>(
    client: PoolClient,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    try {
      await client.query("BEGIN")
      await client.query(`SET LOCAL app.current_feed = '${this.feedCode}'`)
      const result = await fn(client)
      await client.query("COMMIT")
      return result as any
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}
