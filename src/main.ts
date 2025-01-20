import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { WsAdapter } from "@nestjs/platform-ws"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useWebSocketAdapter(new WsAdapter(app))
  app.enableCors()

  const openApiConfig = new DocumentBuilder()
    .setTitle("Transit Tracker API")
    .setVersion("0.1")
    .build()

  const documentFactory = () => SwaggerModule.createDocument(app, openApiConfig)
  SwaggerModule.setup("openapi", app, documentFactory)

  await app.listen(3000)
}

bootstrap()
