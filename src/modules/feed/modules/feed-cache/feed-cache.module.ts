import { Module } from "@nestjs/common"
import { FeedCacheService } from "./feed-cache.service"

@Module({
  providers: [FeedCacheService],
  exports: [FeedCacheService],
})
export class FeedCacheModule {}
