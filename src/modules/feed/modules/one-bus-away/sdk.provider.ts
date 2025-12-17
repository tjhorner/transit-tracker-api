import { FactoryProvider } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import OnebusawaySDK from "onebusaway-sdk"
import { FeedContext } from "../../interfaces/feed-provider.interface"
import { OneBusAwayConfig } from "./config"
import { OneBusAwayInstrumentationService } from "./instrumentation.service"

export const oneBusAwaySdkProvider: FactoryProvider<OnebusawaySDK> = {
  provide: OnebusawaySDK,
  inject: [
    REQUEST,
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
      maxRetries: 5,
      defaultQuery: {
        version: "2",
      },
      fetch: instrumentationService?.fetch.bind(instrumentationService),
    }),
}
