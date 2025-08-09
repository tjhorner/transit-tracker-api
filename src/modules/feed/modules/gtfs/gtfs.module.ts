import { Module } from "@nestjs/common"
import { Pool } from "pg"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsRealtimeService } from "./gtfs-realtime.service"
import { GtfsService } from "./gtfs.service"
import { GtfsSyncService } from "./sync/gtfs-sync.service"

export const PG_POOL = Symbol.for("PG_POOL")

@Module({
  imports: [FeedCacheModule],
  providers: [
    GtfsService,
    GtfsDbService,
    GtfsRealtimeService,
    GtfsSyncService,
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          max: 1,
          connectionString: process.env.DATABASE_URL,
        }),
    },
  ],
  exports: [GtfsService],
})
export class GtfsModule {}
