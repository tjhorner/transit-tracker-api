import { forwardRef, Inject, Injectable, Scope } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Kysely, sql, Transaction } from "kysely"
import { InjectKysely } from "nestjs-kysely"
import { Pool, PoolClient } from "pg"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { DB } from "./db"
import { IMPORT_PG_POOL } from "./gtfs.module"

@Injectable({ scope: Scope.REQUEST })
export class GtfsDbService {
  private readonly feedCode: string

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    @Inject(forwardRef(() => IMPORT_PG_POOL)) private readonly importPool: Pool,
    @Inject(REQUEST) { feedCode }: FeedContext,
  ) {
    this.feedCode = feedCode
  }

  async tx<T>(fn: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return await this.db.transaction().execute(async (tx) => {
      await sql`SET LOCAL app.current_feed = '${sql.raw(
        this.feedCode,
      )}';`.execute(tx)
      return await fn(tx)
    })
  }

  async importTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.importPool.connect()

    try {
      await client.query("BEGIN")
      await client.query(`SET LOCAL app.current_feed = '${this.feedCode}'`)
      await fn(client)
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}
