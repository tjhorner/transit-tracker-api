import KeyvBrotli from "@keyv/compress-brotli"
import KeyvRedis from "@keyv/redis"
import { Global, Module } from "@nestjs/common"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
import Keyv from "keyv"
import ms from "ms"

@Global()
@Module({
  providers: [
    {
      provide: Cacheable,
      useFactory: () =>
        new Cacheable({
          primary: createKeyvMemory({
            lruSize: 5000,
            checkInterval: ms("1h"),
          }),
          secondary: process.env.REDIS_URL
            ? new Keyv({
                compression: new KeyvBrotli(),
                store: new KeyvRedis(process.env.REDIS_URL, {
                  namespace: "cache",
                }),
              })
            : undefined,
        }),
    },
  ],
  exports: [Cacheable],
})
export class CacheModule {}
