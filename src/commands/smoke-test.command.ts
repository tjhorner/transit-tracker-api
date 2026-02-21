import { Logger } from "@nestjs/common"
import { Command, CommandRunner } from "nest-commander"
import { FeedService } from "src/modules/feed/feed.service"
import {
  StopRoute,
  TripStop,
} from "src/modules/feed/interfaces/feed-provider.interface"

@Command({
  name: "smoke-test",
  arguments: "<feedCode>",
  description: "Run a smoke test for the specified feed",
})
export class SmokeTestCommand extends CommandRunner {
  private readonly logger = new Logger(SmokeTestCommand.name)

  constructor(private readonly feedService: FeedService) {
    super()
  }

  async run(
    passedParams: string[],
    options?: Record<string, any>,
  ): Promise<void> {
    const [feedCode] = passedParams
    this.logger.log(`Running smoke test for feed: ${feedCode}`)

    const provider = this.feedService.getFeedProvider(feedCode)
    if (!provider) {
      this.logger.error(`No provider found for feed code: ${feedCode}`)
      return
    }

    try {
      if (!provider.listStops) {
        throw new Error(
          `Provider for feed ${feedCode} does not implement listStops, cannot run smoke test`,
        )
      }

      const stops = await provider.listStops()
      this.logger.log(`Retrieved ${stops.length} stops for feed: ${feedCode}`)

      if (stops.length === 0) {
        this.logger.warn(`No stops found for feed: ${feedCode}`)
      } else {
        const sampleStop = stops[0]
        this.logger.log(`Sample stop: ${JSON.stringify(sampleStop)}`)
      }

      let schedule: TripStop[] = []
      while (schedule.length === 0) {
        let randomStop = stops[Math.floor(Math.random() * stops.length)]
        let routesAtStop: StopRoute[] = []
        while (routesAtStop.length === 0) {
          randomStop = stops[Math.floor(Math.random() * stops.length)]
          routesAtStop = await provider.getRoutesForStop(randomStop.stopId)

          if (routesAtStop.length === 0) {
            this.logger.warn(
              `No routes found for stop ${randomStop.stopId}, picking another stop...`,
            )
          }
        }

        schedule = await provider.getUpcomingTripsForRoutesAtStops([
          {
            routeId: routesAtStop[0]?.routeId,
            stopId: randomStop.stopId,
          },
        ])

        this.logger.log(
          `Retrieved ${schedule.length} upcoming trips for stop ${randomStop.stopId} on feed: ${feedCode}`,
        )

        this.logger.log(schedule.slice(0, 3))
      }

      this.logger.log(`Smoke test completed successfully for feed: ${feedCode}`)
    } catch (error: any) {
      this.logger.error(
        `Error during smoke test for feed: ${feedCode} - ${error.message}`,
      )
    }
  }
}
