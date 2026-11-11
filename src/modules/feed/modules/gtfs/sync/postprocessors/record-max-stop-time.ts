import { Logger } from "@nestjs/common"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { GtfsDbService } from "../../gtfs-db.service"
import { SyncPostProcessor } from "../interface/sync-post-processor.interface"
import { recordMaxStopTime } from "../queries/record-max-stop-time.queries"

/**
 * Stores the feed's latest stop time, which tells schedule lookups how many
 * service days back a trip can still be running.
 */
export class RecordMaxStopTimePostProcessor implements SyncPostProcessor {
  private readonly logger = new Logger(RecordMaxStopTimePostProcessor.name)

  async process(db: GtfsDbService, { feedCode }: FeedContext) {
    this.logger.log("Recording the latest stop time")
    await recordMaxStopTime.run({ feedCode }, db)
  }
}
