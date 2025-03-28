import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "src/app.module"
import { FeedService } from "src/modules/feed/feed.service"
import { GtfsService } from "src/modules/feed/modules/gtfs/gtfs.service"

async function main() {
  const feedCode = process.argv[2]
  const app = await NestFactory.createApplicationContext(AppModule)

  const logger = new Logger("sync-gtfs")

  const feedService = app.get(FeedService)
  const providers: GtfsService[] = []

  if (feedCode) {
    const provider = feedService.getFeedProvider(feedCode)
    if (!provider) {
      logger.error("Invalid feed code")
      process.exit(1)
    }

    if (!(provider instanceof GtfsService)) {
      logger.error("Feed is not provided by GTFS")
      process.exit(1)
    }

    providers.push(provider)
  } else {
    providers.push(...feedService.getFeedProvidersOfType(GtfsService))
  }

  for (const provider of providers) {
    await provider.sync()
  }

  await app.close()
  process.exit(0)
}

main()
