import { Module } from "@nestjs/common"
import { DateTimeModule } from "src/modules/datetime/datetime.module"
import { FeedCacheModule } from "../feed-cache/feed-cache.module"
import { hafasClientProvider } from "./client.provider"
import { HafasService } from "./hafas.service"

@Module({
  imports: [FeedCacheModule, DateTimeModule],
  providers: [hafasClientProvider, HafasService],
  exports: [HafasService],
})
export class HafasModule {}
