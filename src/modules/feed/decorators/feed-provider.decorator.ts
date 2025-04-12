import { applyDecorators, Injectable, Scope } from "@nestjs/common"
import { DiscoveryService } from "@nestjs/core"

export const ProviderKey = DiscoveryService.createDecorator<string>()

export function RegisterFeedProvider(feedCode: string) {
  return applyDecorators(
    Injectable({ scope: Scope.REQUEST, durable: true }),
    ProviderKey(feedCode),
  )
}
