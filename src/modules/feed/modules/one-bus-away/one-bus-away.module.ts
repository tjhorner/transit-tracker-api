import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { OneBusAwayInstrumentationService } from "./instrumentation.service"
import { OneBusAwayService } from "./one-bus-away.service"
import { oneBusAwaySdkProvider } from "./sdk.provider"

@Module({
  imports: [FeedCacheModule],
  providers: [
    OneBusAwayInstrumentationService,
    oneBusAwaySdkProvider,
    OneBusAwayService,
  ],
  exports: [OneBusAwayService],
})
export class OneBusAwayModule {}
