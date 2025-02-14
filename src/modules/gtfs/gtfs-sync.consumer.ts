import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Job } from "bullmq"
import { GtfsSyncService } from "./gtfs-sync.service"
import { GTFS_SYNC_QUEUE } from "./gtfs.const"
import { Logger } from "@nestjs/common"

@Processor(GTFS_SYNC_QUEUE)
export class GtfsSyncConsumer extends WorkerHost {
  private readonly logger = new Logger(GtfsSyncConsumer.name)

  constructor(private readonly gtfsSyncService: GtfsSyncService) {
    super()
  }

  async process(job: Job, token?: string): Promise<any> {
    this.logger.log(
      `Running scheduled sync of GTFS feed "${job.data.feedCode}"`,
    )
    await this.gtfsSyncService.importFromUrl(job.data.feedCode, job.data.url)
  }
}
