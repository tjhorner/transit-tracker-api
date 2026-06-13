import { FactoryProvider } from "@nestjs/common"
import OnebusawaySDK from "onebusaway-sdk"
import { FEED_CONTEXT } from "../../feed-context"
import { FeedContext } from "../../interfaces/feed-provider.interface"
import { OneBusAwayConfig } from "./config"
import { OneBusAwayInstrumentationService } from "./instrumentation.service"

export const oneBusAwaySdkProvider: FactoryProvider<OnebusawaySDK> = {
  provide: OnebusawaySDK,
  inject: [
    FEED_CONTEXT,
    {
      token: OneBusAwayInstrumentationService,
      optional: true,
    },
  ],
  useFactory: (
    { config }: FeedContext<OneBusAwayConfig>,
    instrumentationService?: OneBusAwayInstrumentationService,
  ) =>
    new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout,
      maxRetries: 5,
      defaultQuery: {
        version: "2",
      },
      fetch: instrumentationService?.fetch.bind(instrumentationService),
    }),
}
