import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common"
import { FeedService } from "src/modules/feed/feed.service"

@Controller("healthz")
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(private readonly feedService: FeedService) {}

  @Get()
  async healthCheck() {
    const feeds = this.feedService.getAllFeedProviders()
    const healthchecks = Object.entries(feeds).map(
      async ([feedCode, provider]) => {
        let healthy = true
        try {
          await provider.healthCheck()
        } catch (e: any) {
          healthy = false
          this.logger.error(
            `Health check failed for feed ${feedCode}: ${e.message}`,
            e.stack,
          )
        }

        return {
          feedCode,
          healthy,
        }
      },
    )

    const results = await Promise.all(healthchecks)
    const anyUnhealthy = results.some((result) => !result.healthy)

    const resp = {
      timestamp: new Date().toISOString(),
      feeds: results,
    }

    if (anyUnhealthy) {
      throw new InternalServerErrorException(resp)
    }

    return resp
  }
}
