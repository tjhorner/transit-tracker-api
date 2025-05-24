import { Logger } from "@nestjs/common"
import { Command, CommandRunner, Option } from "nest-commander"
import { FeedSyncService } from "src/modules/feed/feed-sync.service"

interface SyncCommandOptions {
  force: boolean
}

@Command({
  name: "sync",
})
export class SyncCommand extends CommandRunner {
  private readonly logger = new Logger(SyncCommand.name)

  constructor(private readonly feedSyncService: FeedSyncService) {
    super()
  }

  async run(_: any, opts?: SyncCommandOptions): Promise<void> {
    await this.feedSyncService.syncAllFeeds(opts?.force)
  }

  @Option({
    flags: "-f, --force",
    description: "Force sync all feeds",
  })
  parseForce(): boolean {
    return true
  }
}
