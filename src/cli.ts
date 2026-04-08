import { CommandFactory } from "nest-commander"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await CommandFactory.createWithoutRunning(AppModule, [
    "verbose",
    "log",
    "debug",
    "error",
    "warn",
  ])

  app.enableShutdownHooks()
  await CommandFactory.runApplication(app)
  await app.close()

  process.exit(0)
}

bootstrap()
