import KeyvBrotli from "@keyv/compress-brotli"
import KeyvRedis from "@keyv/redis"
import { Global, Module } from "@nestjs/common"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
import Keyv from "keyv"
import ms from "ms"
import zlib from "node:zlib"

const {
  constants: { BROTLI_PARAM_QUALITY },
} = zlib

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
                compression: new KeyvBrotli({
                  compressOptions: {
                    params: {
                      [BROTLI_PARAM_QUALITY]: 1,
                    },
                  },
                }),
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
