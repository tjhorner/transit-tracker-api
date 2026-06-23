import { type ArgumentsHost, Catch, HttpException } from "@nestjs/common"
import { BaseWsExceptionFilter } from "@nestjs/websockets"
import { DomainErrorKind } from "src/errors/domain-error"
import { ConnectedClient } from "src/schedule/client"
import { captureWsException } from "src/sentry/websocket"

@Catch(HttpException)
export class WebSocketHttpExceptionFilter extends BaseWsExceptionFilter {
  private readonly httpStatusToWsErrorKind: Record<number, DomainErrorKind> = {
    400: "invalidInput",
    404: "notFound",
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<ConnectedClient>()
    captureWsException(client, exception)
    client.send(JSON.stringify(this.httpExceptionToWsError(exception)))
    super.catch(exception, host)
  }

  private httpExceptionToWsError(exception: HttpException): {
    kind: string
    error: string
  } {
    const response = exception.getResponse()
    if (typeof response === "object" && response !== null) {
      const { statusCode, message } = response as {
        statusCode: number
        message: string | string[]
      }
      return {
        kind: this.httpStatusToWsErrorKind[statusCode] || "http",
        error: Array.isArray(message) ? message.join(", ") : message,
      }
    } else {
      return {
        kind: this.httpStatusToWsErrorKind[exception.getStatus()] || "http",
        error: exception.message,
      }
    }
  }
}

@Catch()
export class WebSocketExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<ConnectedClient>()
    captureWsException(client, exception)
    client.send(
      JSON.stringify({
        kind: "internal",
        error: "Internal error, disconnecting",
      }),
    )
    client.close(1011) // 1011 = Internal Error
    super.catch(exception, host)
  }
}
