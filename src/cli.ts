import { CommandFactory } from "nest-commander"
import { AppModule } from "./app.module"

async function bootstrap() {
  await CommandFactory.run(AppModule, [
    "verbose",
    "log",
    "debug",
    "error",
    "warn",
  ])
}

bootstrap()
