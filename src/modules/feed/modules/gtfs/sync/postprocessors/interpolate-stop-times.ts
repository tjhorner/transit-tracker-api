import { Logger } from "@nestjs/common"
import { FeedContext } from "src/modules/feed/interfaces/feed-provider.interface"
import { GtfsDbService } from "../../gtfs-db.service"
import { SyncPostProcessor } from "../interface/sync-post-processor.interface"
import {
  emptyArrivalTimesExist,
  interpolateEmptyArrivalTimes,
  updateEmptyDepartureTimes,
} from "../queries/interpolate-empty-stop-times.queries"

export class InterpolateEmptyStopTimesPostProcessor implements SyncPostProcessor {
  private readonly logger = new Logger(
    InterpolateEmptyStopTimesPostProcessor.name,
  )

  async process(db: GtfsDbService, { feedCode }: FeedContext) {
    const [{ exists }] = await emptyArrivalTimesExist.run({ feedCode }, db)

    if (!exists) {
      this.logger.log(
        "No empty arrival times were found; skipping interpolation",
      )
      return
    }

    this.logger.log("Interpolating empty arrival times")

    const interpolatedArrivals =
      await interpolateEmptyArrivalTimes.runWithCounts(
        {
          feedCode,
        },
        db,
      )

    this.logger.log(
      `Interpolated ${interpolatedArrivals.rowCount.toLocaleString()} empty arrival times`,
    )

    this.logger.log("Filling in empty departure times")

    const filledDepartures = await updateEmptyDepartureTimes.runWithCounts(
      {
        feedCode,
      },
      db,
    )

    this.logger.log(
      `Filled in ${filledDepartures.rowCount.toLocaleString()} empty departure times`,
    )
  }
}
