import { Redlock } from "@anchan828/nest-redlock"
import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { SchedulerRegistry } from "@nestjs/schedule"
import * as Sentry from "@sentry/node"
import { CronJob, validateCronExpression } from "cron"
import ms from "ms"
import { exec } from "node:child_process"
import { FeedService } from "./feed.service"

@Injectable()
export class FeedSyncService implements OnModuleInit {
  private readonly logger = new Logger(FeedSyncService.name)

  constructor(
    private readonly feedService: FeedService,
    private readonly eventEmitter: EventEmitter2,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    this.scheduleSyncJob()
  }

  private scheduleSyncJob() {
    if (!process.env.FEED_SYNC_SCHEDULE) {
      this.logger.log(
        "No FEED_SYNC_SCHEDULE environment variable provided; feeds will not automatically sync",
      )
      return
    }

    const scheduleCron = process.env.FEED_SYNC_SCHEDULE

    const validation = validateCronExpression(scheduleCron)
    if (!validation.valid) {
      this.logger.error(
        `Invalid cron expression for FEED_SYNC_SCHEDULE: ${validation.error?.message}`,
      )
      return
    }

    this.logger.log(
      `Scheduling feed sync according to cron expression: ${scheduleCron}`,
    )

    const InstrumentedCronJob = Sentry.cron.instrumentCron(CronJob, "feed-sync")
    const job = new InstrumentedCronJob(
      scheduleCron,
      this.syncAllFeeds.bind(this),
    )

    this.schedulerRegistry.addCronJob("feed-sync", job)
    job.start()
  }

  @Redlock("feed-sync", ms("1m"), { retryCount: 0 })
  async syncAllFeeds(force: boolean = false) {
    this.eventEmitter.emit("feed.sync.start")

    this.logger.log("Running sync of all feeds")

    if (process.env.PRE_IMPORT_HOOK) {
      this.logger.log(`Running pre-import hook: ${process.env.PRE_IMPORT_HOOK}`)

      try {
        await this.runScript(process.env.PRE_IMPORT_HOOK)
      } catch (e: any) {
        Sentry.captureException(e, {
          level: "fatal",
          tags: {
            module: "feed-sync",
            action: "pre-import-hook",
          },
        })

        this.eventEmitter.emit("feed.sync.error", {
          message: `Pre-import hook failed: ${e.message}`,
          stack: e.stack,
        })

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
        Sentry.captureException(e, {
          level: "warning",
          tags: {
            module: "feed-sync",
            action: "sync-individual-feed",
            feedCode,
          },
        })

        this.eventEmitter.emit("feed.sync.warn", {
          feedCode,
          message: e.message,
          stack: e.stack,
        })

        this.logger.warn(
          `Sync of feed "${feedCode}" failed: ${e.message}\n${e.stack}`,
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
        Sentry.captureException(e, {
          level: "fatal",
          tags: {
            module: "feed-sync",
            action: "post-import-hook",
          },
        })

        this.eventEmitter.emit("feed.sync.error", {
          message: `Post-import hook failed: ${e.message}`,
          stack: e.stack,
        })

        this.logger.error(`Post-import hook failed: ${e.message}`, e.stack)
        return
      }
    }

    this.logger.log("Sync of all feeds completed")

    this.eventEmitter.emit("feed.sync.completed")
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
