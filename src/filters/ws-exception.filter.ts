import { type ArgumentsHost, Catch, HttpException } from "@nestjs/common"
import { BaseWsExceptionFilter } from "@nestjs/websockets"
import { SentryExceptionCaptured } from "@sentry/nestjs"
import { WebSocket } from "ws"

@Catch(HttpException)
export class WebSocketHttpExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<WebSocket>()
    client.send(JSON.stringify(exception.getResponse()))
    super.catch(exception, host)
  }
}

@Catch()
export class WebSocketExceptionFilter extends BaseWsExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: Error, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<WebSocket>()
    client.send(JSON.stringify({ error: "Internal error, disconnecting" }))
    client.close(1011)
    super.catch(exception, host)
  }
}
