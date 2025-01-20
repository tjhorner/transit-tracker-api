import { ArgumentsHost, Catch, HttpException } from "@nestjs/common"
import { BaseWsExceptionFilter } from "@nestjs/websockets"
import { WebSocket } from "ws"

@Catch(HttpException)
export class WebSocketHttpExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<WebSocket>()
    client.send(JSON.stringify(exception.getResponse()))
  }
}
