import KeyvRedis from "@keyv/redis"
import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Optional,
} from "@nestjs/common"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
import Redis from "ioredis"
import Keyv from "keyv"
import ms from "ms"
import { env } from "src/env"

export const REDIS_CLIENT = Symbol("REDIS_CLIENT")

@Global()
@Module({
  providers: [
    {
      provide: Cacheable,
      useFactory: () =>
        new Cacheable({
          primary: createKeyvMemory({
            useClone: false,
            lruSize: env.int("LRU_CACHE_SIZE", 1000),
            checkInterval: ms("15m"),
          }),
          secondary: env.string("REDIS_URL")
            ? new Keyv({
                serialize: JSON.stringify,
                deserialize: JSON.parse,
                store: new KeyvRedis(env.string("REDIS_URL"), {
                  namespace: "cache",
                }),
              })
            : undefined,
        }),
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redisUrl = env.string("REDIS_URL")
        return redisUrl ? new Redis(redisUrl) : undefined
      },
    },
  ],
  exports: [Cacheable, REDIS_CLIENT],
})
export class CacheModule implements OnApplicationShutdown {
  constructor(
    private readonly cacheable: Cacheable,
    @Inject(REDIS_CLIENT) @Optional() private readonly redis?: Redis,
  ) {}

  async onApplicationShutdown() {
    await this.cacheable.disconnect()
    await this.redis?.quit()
  }
}
