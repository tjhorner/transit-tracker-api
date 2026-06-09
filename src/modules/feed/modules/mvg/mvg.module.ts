import { Module } from "@nestjs/common"
import { DateTimeModule } from "src/modules/datetime/datetime.module"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { mvgApiClientProvider } from "./api-client.provider"
import { MvgService } from "./mvg.service"

@Module({
  imports: [FeedCacheModule, DateTimeModule],
  providers: [mvgApiClientProvider, MvgService],
  exports: [MvgService],
})
export class MvgModule {}
