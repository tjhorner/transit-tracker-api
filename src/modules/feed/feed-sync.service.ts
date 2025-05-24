import { Redlock } from "@anchan828/nest-redlock"
import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import ms from "ms"
import { exec } from "node:child_process"
import { FeedService } from "./feed.service"

@Injectable()
export class FeedSyncService {
  private readonly logger = new Logger(FeedSyncService.name)

  constructor(private readonly feedService: FeedService) {}

  @Cron("0 0 * * *")
  @Redlock("feed-sync", ms("1m"), { retryCount: 0 })
  async syncAllFeeds(force: boolean = false) {
    this.logger.log("Running sync of all feeds")

    if (process.env.PRE_IMPORT_HOOK) {
      this.logger.log(`Running pre-import hook: ${process.env.PRE_IMPORT_HOOK}`)
      try {
        await this.runScript(process.env.PRE_IMPORT_HOOK)
      } catch (e: any) {
        this.logger.error(`Pre-import hook failed: ${e.message}`, e.stack)
        return
      }
    }

    const feedProviders = this.feedService.getAllFeedProviders()

    for (const [feedCode, provider] of Object.entries(feedProviders)) {
      if (!provider.sync) {
        continue
      }

      this.logger.log(`Syncing feed "${feedCode}"`)

      try {
        await provider.sync({ force })
      } catch (e: any) {
        this.logger.warn(
          `Sync of feed "${feedCode}" failed: ${e.message}`,
          e.stack,
        )
      }
    }

    if (process.env.POST_IMPORT_HOOK) {
      this.logger.log(
        `Running post-import hook: ${process.env.POST_IMPORT_HOOK}`,
      )

      try {
        await this.runScript(process.env.POST_IMPORT_HOOK)
      } catch (e: any) {
        this.logger.error(`Post-import hook failed: ${e.message}`, e.stack)
        return
      }
    }

    this.logger.log("Sync of all feeds completed")
  }

  private async runScript(script: string) {
    return new Promise((resolve, reject) => {
      const scriptProcess = exec(script, (error, stdout, _) => {
        if (error) {
          return reject(error)
        }

        resolve(stdout)
      })

      scriptProcess.stdout?.pipe(process.stdout)
      scriptProcess.stderr?.pipe(process.stderr)
    })
  }
}
