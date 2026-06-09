import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { mvgApiClientProvider } from "./api-client.provider"
import { MvgService } from "./mvg.service"

@Module({
  imports: [FeedCacheModule],
  providers: [mvgApiClientProvider, MvgService],
  exports: [MvgService],
})
export class MvgModule {}
