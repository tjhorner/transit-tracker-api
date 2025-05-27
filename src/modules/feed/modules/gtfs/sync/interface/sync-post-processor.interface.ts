import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { GtfsConfig } from "../../config"
import { GtfsDbService } from "../../gtfs-db.service"

export interface SyncPostProcessor {
  process(db: GtfsDbService, context: FeedContext<GtfsConfig>): Promise<void>
}
