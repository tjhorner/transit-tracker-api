import { NestFactory } from "@nestjs/core"
import { AppModule } from "src/app.module"
import { FeedService } from "src/modules/feed/feed.service"
import { GtfsService } from "src/modules/gtfs/gtfs.service"

async function main() {
  const feedCode = process.argv[2]
  const app = await NestFactory.createApplicationContext(AppModule)

  const provider = app.get(FeedService).getScheduleProvider(feedCode)
  if (!provider) {
    console.error("Invalid feed code")
    process.exit(1)
  }

  if (!(provider instanceof GtfsService)) {
    console.error("Feed is not provided by GTFS")
    process.exit(1)
  }

  await provider.sync()

  await app.close()
  process.exit(0)
}

main()
