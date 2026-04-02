import { Logger } from "@nestjs/common"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { GTFS_TABLES, GtfsDbService } from "../../gtfs-db.service"
import { SyncPostProcessor } from "../interface/sync-post-processor.interface"

export class VacuumTablesPostProcessor implements SyncPostProcessor {
  private readonly logger = new Logger(VacuumTablesPostProcessor.name)

  async process(db: GtfsDbService, { feedCode }: FeedContext): Promise<void> {
    this.logger.log("Running VACUUM ANALYZE on partition tables...")

    const connection = await db.obtainConnection()

    connection.on("error", (err) => {
      this.logger.warn(
        `Error in database connection for vacuuming GTFS tables: ${err.message}`,
      )
    })

    try {
      for (const table of GTFS_TABLES) {
        const partition = `${table}__${feedCode}`
        await connection.query(`VACUUM ANALYZE "${partition}"`)
      }
    } catch (e: any) {
      this.logger.warn(
        `Error during vacuuming GTFS tables; skipping: ${e.message}`,
      )
    } finally {
      connection.release()
    }

    this.logger.log("VACUUM ANALYZE completed")
  }
}
