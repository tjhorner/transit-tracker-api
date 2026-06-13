import { FactoryProvider } from "@nestjs/common"
import { FEED_CONTEXT } from "../../feed-context"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { MvgApiClient } from "./api-client"
import { MvgConfig } from "./config"

export const mvgApiClientProvider: FactoryProvider<MvgApiClient> = {
  provide: MvgApiClient,
  inject: [FEED_CONTEXT],
  useFactory: ({ config }: FeedContext<MvgConfig>) =>
    new MvgApiClient(config.baseUrl),
}
