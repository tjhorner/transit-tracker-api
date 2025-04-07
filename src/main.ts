import { NestFactory } from "@nestjs/core"
import { NestExpressApplication } from "@nestjs/platform-express"
import { WsAdapter } from "@nestjs/platform-ws"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import "./sentry"
import otelSDK from "./tracing"

function configureForFly(app: NestExpressApplication) {
  if (!process.env.FLY_MACHINE_ID) {
    return
  }

  // Fly's reverse proxy is at most 2 hops away
  app.set("trust proxy", 2)
}

async function bootstrap() {
  otelSDK.start()

  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  configureForFly(app)
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

  await app.listen(3000)
}

bootstrap()
