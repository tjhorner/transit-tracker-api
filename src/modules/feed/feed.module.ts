import { Module } from "@nestjs/common"
import { FeedService } from "./feed.service"
import { GtfsModule } from "src/modules/feed/modules/gtfs/gtfs.module"
import { OneBusAwayModule } from "src/modules/feed/modules/one-bus-away/one-bus-away.module"
import { FeedsController } from "./feeds.controller"
import { DiscoveryModule } from "@nestjs/core"
import { FeedSyncService } from "./feed-sync.service"
import { RedlockModule } from "@anchan828/nest-redlock"
import Redis from "ioredis"

@Module({
  imports: [
    RedlockModule.register({
      clients: [new Redis(process.env.REDIS_URL!, { keyPrefix: "redlock" })],
    }),
    DiscoveryModule,
    GtfsModule,
    OneBusAwayModule,
  ],
  controllers: [FeedsController],
  providers: [FeedService, FeedSyncService],
  exports: [FeedService],
})
export class FeedModule {}
