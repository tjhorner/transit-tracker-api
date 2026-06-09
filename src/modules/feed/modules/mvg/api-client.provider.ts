import { FactoryProvider } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { MvgApiClient } from "./api-client"
import { MvgConfig } from "./config"

export const mvgApiClientProvider: FactoryProvider<MvgApiClient> = {
  provide: MvgApiClient,
  inject: [REQUEST],
  useFactory: ({ config }: FeedContext<MvgConfig>) =>
    new MvgApiClient(config.baseUrl),
}
