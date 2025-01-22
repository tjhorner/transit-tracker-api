import { Module } from "@nestjs/common"
import { PostgresDialect } from "kysely"
import { KyselyModule } from "nestjs-kysely"
import { Pool } from "pg"
import { GtfsService } from "./gtfs.service"
import { GtfsSyncService } from "./gtfs-sync.service"
import { BullModule } from "@nestjs/bullmq"
import { GtfsSyncConsumer } from "./gtfs-sync.consumer"
import { GTFS_SYNC_QUEUE } from "./gtfs.const"

const gtfsSyncQueue = BullModule.registerQueue({
  name: GTFS_SYNC_QUEUE,
})

@Module({
  imports: [
    gtfsSyncQueue,
    KyselyModule.forRoot({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          idleTimeoutMillis: 60000,
        }),
      }),
    }),
  ],
  providers: [GtfsService, GtfsSyncService, GtfsSyncConsumer],
  exports: [GtfsService, GtfsSyncService, gtfsSyncQueue],
})
export class GtfsModule {}

