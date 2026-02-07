import { RedlockModule } from "@anchan828/nest-redlock"
import { Module } from "@nestjs/common"
import { DiscoveryModule } from "@nestjs/core"
import Redis from "ioredis"
import { GtfsModule } from "src/modules/feed/modules/gtfs/gtfs.module"
import { OneBusAwayModule } from "src/modules/feed/modules/one-bus-away/one-bus-away.module"
import { FeedSyncService } from "./feed-sync.service"
import { FeedService } from "./feed.service"
import { FeedsController } from "./feeds.controller"
import { HafasModule } from "./modules/hafas/hafas.module"
import { MvgModule } from "./modules/mvg/mvg.module"

@Module({
  imports: [
    RedlockModule.registerAsync({
      useFactory: () => ({
        clients: [new Redis(process.env.REDIS_URL!, { keyPrefix: "redlock" })],
      }),
    }),
    DiscoveryModule,
    GtfsModule,
    OneBusAwayModule,
    HafasModule,
    MvgModule,
  ],
  controllers: [FeedsController],
  providers: [FeedService, FeedSyncService],
  exports: [FeedService, FeedSyncService],
})
export class FeedModule {}
