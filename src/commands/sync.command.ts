import { Logger } from "@nestjs/common"
import { Command, CommandRunner, Option } from "nest-commander"
import { FeedSyncService } from "src/modules/feed/feed-sync.service"

interface SyncCommandOptions {
  force?: boolean
  feedCodes?: string[]
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
    await this.feedSyncService.syncAllFeeds({
      force: opts?.force,
      feedCodes: opts?.feedCodes,
    })
  }

  @Option({
    flags: "-f, --force",
    description: "Force sync all feeds",
  })
  parseForce(): boolean {
    return true
  }

  @Option({
    name: "feedCodes",
    flags: "--feed [feedCodes...]",
    description: "Only sync the specified feeds",
  })
  parseFeeds(feedCode: string, acc: string[] = []): string[] {
    acc.push(feedCode)
    return acc
  }
}
