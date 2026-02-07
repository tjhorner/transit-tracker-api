import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { MvgService } from "./mvg.service"

@Module({
  imports: [FeedCacheModule],
  providers: [MvgService],
  exports: [MvgService],
})
export class MvgModule {}
