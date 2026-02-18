import { ConsoleLogger, Logger } from "@nestjs/common"

Logger.overrideLogger(new ConsoleLogger({ forceConsole: true }))
