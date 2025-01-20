import { Module } from "@nestjs/common"
import { PostgresDialect } from "kysely"
import { KyselyModule } from "nestjs-kysely"
import { Pool } from "pg"
import { GtfsService } from "./gtfs.service"
import { GtfsSyncService } from "./gtfs-sync.service"

@Module({
  imports: [
    KyselyModule.forRoot({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          idleTimeoutMillis: 60000,
        }),
      }),
    }),
  ],
  providers: [GtfsService, GtfsSyncService],
  exports: [GtfsService, GtfsSyncService],
})
export class GtfsModule {}
