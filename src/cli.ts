// organize-imports-ignore
import "./sentry"
import { CommandFactory } from "nest-commander"
import { Logger } from "nestjs-pino"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await CommandFactory.createWithoutRunning(AppModule, {
    bufferLogs: true,
  })

  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()
  await CommandFactory.runApplication(app)
  await app.close()

  // command should exit on its own, but timeout just in case
  const timeout = setTimeout(() => {
    console.warn(
      "Command did not exit within 5 seconds of completion; forcing exit.",
    )

    process.exit(0)
  }, 5000)

  // so the event loop doesn't wait for this timeout
  timeout.unref()
}

bootstrap()
