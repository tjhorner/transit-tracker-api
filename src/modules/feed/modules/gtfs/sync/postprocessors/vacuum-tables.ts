import { Logger } from "@nestjs/common"
import { GtfsDbService } from "../../gtfs-db.service"
import { SyncPostProcessor } from "../interface/sync-post-processor.interface"
import { vacuumTables } from "../queries/vacuum-tables.queries"

export class VacuumTablesPostProcessor implements SyncPostProcessor {
  private readonly logger = new Logger(VacuumTablesPostProcessor.name)

  async process(db: GtfsDbService): Promise<void> {
    this.logger.log("Vacuuming GTFS tables...")

    const connection = await db.obtainConnection()

    connection.on("error", (err) => {
      this.logger.warn(
        `Error in database connection for vacuuming GTFS tables: ${err.message}`,
      )
    })

    try {
      await vacuumTables.run(undefined, connection)
    } catch (e: any) {
      this.logger.warn(
        `Error during vacuuming GTFS tables; skipping: ${e.message}`,
      )
    } finally {
      connection.release()
    }

    this.logger.log("Vacuuming completed")
  }
}
