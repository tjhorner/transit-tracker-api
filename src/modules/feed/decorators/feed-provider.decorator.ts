import { applyDecorators, Injectable, Scope } from "@nestjs/common"
import { DiscoveryService } from "@nestjs/core"

export const FeedCode = DiscoveryService.createDecorator<string>()

export function RegisterFeedProvider(feedCode: string) {
  return applyDecorators(
    Injectable({ scope: Scope.TRANSIENT }),
    FeedCode(feedCode),
  )
}
