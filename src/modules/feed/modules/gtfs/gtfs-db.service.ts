import { Inject, Injectable } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Kysely, sql, Transaction } from "kysely"
import { InjectKysely } from "nestjs-kysely"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { DB } from "./db"

@Injectable()
export class GtfsDbService {
  private readonly feedCode: string

  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
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
}
