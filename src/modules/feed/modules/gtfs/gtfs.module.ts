import { Logger, Module } from "@nestjs/common"
import { Pool } from "pg"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsMetricsService } from "./gtfs-metrics.service"
import { GtfsRealtimeService } from "./gtfs-realtime.service"
import { GtfsService } from "./gtfs.service"
import { GtfsSyncService } from "./sync/gtfs-sync.service"
import { WebResourceService } from "./sync/web-resource.service"
import { ZipFileService } from "./sync/zip-file.service"

export const PG_POOL = Symbol.for("PG_POOL")

@Module({
  imports: [FeedCacheModule],
  providers: [
    ZipFileService,
    WebResourceService,
    GtfsService,
    GtfsDbService,
    GtfsRealtimeService,
    GtfsSyncService,
    GtfsMetricsService,
    {
      provide: PG_POOL,
      useFactory: () => {
        const logger = new Logger("PgPoolFactory")

        const pool = new Pool({
          max: 2,
          connectionString: process.env.DATABASE_URL,
        })

        pool.on("error", (err) => {
          logger.warn(
            `Unexpected error on idle client: ${err.message}\n${err.stack}`,
          )
        })

        return pool
      },
    },
  ],
  exports: [GtfsService],
})
export class GtfsModule {}
