import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { OneBusAwayService } from "./one-bus-away.service"

@Module({
  imports: [FeedCacheModule],
  providers: [OneBusAwayService],
  exports: [OneBusAwayService],
})
export class OneBusAwayModule {}
