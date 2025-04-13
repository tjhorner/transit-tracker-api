import { Module } from "@nestjs/common"
import { PostgresDialect } from "kysely"
import { KyselyModule } from "nestjs-kysely"
import { Pool } from "pg"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsRealtimeService } from "./gtfs-realtime.service"
import { GtfsSyncService } from "./gtfs-sync.service"
import { GtfsService } from "./gtfs.service"

export const IMPORT_PG_POOL = Symbol.for("IMPORT_PG_POOL")

@Module({
  imports: [
    KyselyModule.forRootAsync({
      useFactory: () => ({
        dialect: new PostgresDialect({
          pool: new Pool({
            connectionString: process.env.DATABASE_URL,
            idleTimeoutMillis: 60000,
          }),
        }),
      }),
    }),
  ],
  providers: [
    GtfsService,
    GtfsDbService,
    GtfsRealtimeService,
    GtfsSyncService,
    {
      provide: IMPORT_PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString: process.env.SUPERUSER_DATABASE_URL,
        }),
    },
  ],
  exports: [GtfsService],
})
export class GtfsModule {}
