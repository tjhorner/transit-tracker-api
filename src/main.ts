// organize-imports-ignore
import "./sentry"
import { NestFactory } from "@nestjs/core"
import { NestExpressApplication } from "@nestjs/platform-express"
import { WsAdapter } from "@nestjs/platform-ws"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import otelSDK from "./tracing"
import { ConsoleLogger, Logger } from "@nestjs/common"

function configureForFly(app: NestExpressApplication) {
  if (!process.env.FLY_MACHINE_ID) {
    return
  }

  // Fly's reverse proxy is at most 2 hops away
  app.set("trust proxy", 2)
}

export async function bootstrap() {
  otelSDK.start()

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({
      json: process.env.LOG_JSON === "true",
      compact: process.env.LOG_COMPACT === "true",
    }),
  })

  configureForFly(app)

  if (process.env.TRUST_PROXY) {
    const trustProxy =
      process.env.TRUST_PROXY === "true" ? true : process.env.TRUST_PROXY
    app.set("trust proxy", trustProxy)
  }

  app.useWebSocketAdapter(new WsAdapter(app))
  app.enableCors()

  const openApiConfig = new DocumentBuilder()
    .setTitle("Transit Tracker API")
    .setVersion("0.1")
    .build()

  const documentFactory = () => SwaggerModule.createDocument(app, openApiConfig)
  SwaggerModule.setup("openapi", app, documentFactory, {
    jsonDocumentUrl: "openapi/json",
  })

  return await app.listen(3000)
}

bootstrap()
