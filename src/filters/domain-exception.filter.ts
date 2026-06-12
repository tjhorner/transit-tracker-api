import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  NotFoundException,
} from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import { BaseWsExceptionFilter } from "@nestjs/websockets"
import { WebSocket } from "ws"
import { DomainError, DomainErrorKind } from "../errors/domain-error"

const httpExceptionForKind: Record<
  DomainErrorKind,
  (message: string) => HttpException
> = {
  notFound: (message) => new NotFoundException(message),
  invalidInput: (message) => new BadRequestException(message),
}

export function toHttpException(error: DomainError): HttpException {
  return httpExceptionForKind[error.kind](error.message)
}

@Catch(DomainError)
export class DomainExceptionFilter extends BaseExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    super.catch(toHttpException(error), host)
  }
}

@Catch(DomainError)
export class WebSocketDomainExceptionFilter extends BaseWsExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<WebSocket>()
    client.send(JSON.stringify({ kind: error.kind, error: error.message }))
    super.catch(error, host)
  }
}
