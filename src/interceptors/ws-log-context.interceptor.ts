import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import { storage } from "nestjs-pino/storage"
import { Observable } from "rxjs"
import { ConnectedClient } from "src/schedule/client"

@Injectable()
export class WsLogContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "ws") {
      return next.handle()
    }

    const client = context.switchToWs().getClient<ConnectedClient>()
    const store = client.logStore
    if (!store) {
      return next.handle()
    }

    return new Observable((subscriber) => {
      const subscription = storage.run(store, () =>
        next.handle().subscribe(subscriber),
      )

      return () => storage.run(store, () => subscription.unsubscribe())
    })
  }
}
