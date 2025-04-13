import { Logger } from "@nestjs/common"
import { Command, CommandRunner, Option } from "nest-commander"
import { FeedService } from "src/modules/feed/feed.service"

interface SyncCommandOptions {
  force: boolean
}

@Command({
  name: "sync",
})
export class SyncCommand extends CommandRunner {
  private readonly logger = new Logger(SyncCommand.name)

  constructor(private readonly feedService: FeedService) {
    super()
  }

  async run(_: any, opts?: SyncCommandOptions): Promise<void> {
    const providers = this.feedService.getAllFeedProviders()

    for (const [key, provider] of Object.entries(providers)) {
      if (!provider.sync) {
        continue
      }

      this.logger.log(`Syncing feed "${key}"...`)
      try {
        await provider.sync({
          force: !!opts?.force,
        })

        this.logger.log(`Feed "${key}" synced successfully`)
      } catch (error: any) {
        this.logger.error(
          `Failed to sync feed "${key}": ${error.message}`,
          error.stack,
        )
      }
    }
  }

  @Option({
    flags: "-f, --force",
    description: "Force sync all feeds",
  })
  parseForce(): boolean {
    return true
  }
}
