import KeyvRedis from "@keyv/redis"
import { Global, Module } from "@nestjs/common"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
import Redis from "ioredis"
import Keyv from "keyv"
import ms from "ms"

export const REDIS_CLIENT = Symbol("REDIS_CLIENT")

@Global()
@Module({
  providers: [
    {
      provide: Cacheable,
      useFactory: () =>
        new Cacheable({
          primary: createKeyvMemory({
            lruSize: process.env.LRU_CACHE_SIZE
              ? parseInt(process.env.LRU_CACHE_SIZE)
              : 1000,
            checkInterval: ms("15m"),
          }),
          secondary: process.env.REDIS_URL
            ? new Keyv({
                serialize: JSON.stringify,
                deserialize: JSON.parse,
                store: new KeyvRedis(process.env.REDIS_URL, {
                  namespace: "cache",
                }),
              })
            : undefined,
        }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : undefined,
    },
  ],
  exports: [Cacheable, REDIS_CLIENT],
})
export class CacheModule {}
