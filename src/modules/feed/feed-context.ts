import { Provider, Scope } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import type { FeedContext } from "./interfaces/feed-provider.interface"

export const FEED_CONTEXT = Symbol("FEED_CONTEXT")

export const feedContextProvider: Provider = {
  provide: FEED_CONTEXT,
  scope: Scope.REQUEST,
  durable: true,
  inject: [REQUEST],
  useFactory: (context: FeedContext) => context,
}
