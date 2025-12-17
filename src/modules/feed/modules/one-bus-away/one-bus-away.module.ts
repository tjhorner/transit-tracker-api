import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { OneBusAwayService } from "./one-bus-away.service"
import { oneBusAwaySdkProvider } from "./sdk.provider"

@Module({
  imports: [FeedCacheModule],
  providers: [oneBusAwaySdkProvider, OneBusAwayService],
  exports: [OneBusAwayService],
})
export class OneBusAwayModule {}
