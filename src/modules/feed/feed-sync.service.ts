import { Redlock } from "@anchan828/nest-redlock"
import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import ms from "ms"
import { FeedService } from "./feed.service"

@Injectable()
export class FeedSyncService {
  private readonly logger = new Logger(FeedSyncService.name)

  constructor(private readonly feedService: FeedService) {}

  @Cron("0 0 * * *")
  @Redlock("feed-sync", ms("1m"), { retryCount: 0 })
  async syncAllFeeds() {
    this.logger.log("Running scheduled sync of all feeds")
    const feedProviders = this.feedService.getAllFeedProviders()

    for (const [feedCode, provider] of Object.entries(feedProviders)) {
      if (!provider.sync) {
        continue
      }

      this.logger.log(`Running scheduled sync of feed "${feedCode}"`)

      try {
        await provider.sync()
      } catch (e: any) {
        this.logger.warn(
          `Scheduled sync of feed "${feedCode}" failed: ${e.message}`,
          e.stack,
        )
      }
    }

    this.logger.log("Scheduled sync of all feeds completed")
  }
}
