import { FactoryProvider, Logger } from "@nestjs/common"
import { createClient, HafasClient } from "hafas-client"
import { FEED_CONTEXT } from "../../feed-context"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { HafasConfig } from "./config"

export const HAFAS_CLIENT = Symbol("HafasClient")

export const hafasClientProvider: FactoryProvider<HafasClient> = {
  provide: HAFAS_CLIENT,
  inject: [FEED_CONTEXT],
  useFactory: ({ feedCode, config }: FeedContext<HafasConfig>) => {
    new Logger(`HafasClientProvider[${feedCode}]`).log(
      `Initializing with HAFAS profile: ${config.profile}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { profile } = require(`hafas-client/p/${config.profile}`)
    return createClient(profile, config.userAgent)
  },
}
