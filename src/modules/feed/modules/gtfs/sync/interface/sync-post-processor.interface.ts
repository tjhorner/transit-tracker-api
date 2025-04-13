import { PoolClient } from "pg"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { GtfsConfig } from "../../config"

export interface SyncPostProcessor {
  process(client: PoolClient, context: FeedContext<GtfsConfig>): Promise<void>
}
