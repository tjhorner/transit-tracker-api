import { Module } from "@nestjs/common"
import { FeedService } from "./feed.service"
import { GtfsModule } from "src/modules/feed/modules/gtfs/gtfs.module"
import { OneBusAwayModule } from "src/modules/feed/modules/one-bus-away/one-bus-away.module"
import { FeedsController } from "./feeds.controller"

@Module({
  imports: [GtfsModule, OneBusAwayModule],
  controllers: [FeedsController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
