import { Injectable } from "@nestjs/common"
import { ThrottlerGuard, ThrottlerRequest } from "@nestjs/throttler"

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } =
      requestProps

    const client = context.switchToWs().getClient()
    const tracker = client._socket.remoteAddress
    const key = generateKey(context, tracker, throttler.name ?? "default")
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name ?? "default",
      )

    // Throw an error when the user reached their limit.
    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      })
    }

    return true
  }
}
