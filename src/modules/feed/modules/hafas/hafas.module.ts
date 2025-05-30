import { Module } from "@nestjs/common"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { HafasService } from "./hafas.service"

@Module({
  imports: [FeedCacheModule],
  providers: [HafasService],
  exports: [HafasService],
})
export class HafasModule {}
