import { Global, Module } from "@nestjs/common"
import { FEED_CONTEXT, feedContextProvider } from "./feed-context"

@Global()
@Module({
  providers: [feedContextProvider],
  exports: [FEED_CONTEXT],
})
export class FeedContextModule {}
