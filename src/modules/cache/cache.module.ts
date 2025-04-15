import { createKeyv as createKeyvRedis } from "@keyv/redis"
import { Global, Module } from "@nestjs/common"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
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
            ? createKeyvRedis(process.env.REDIS_URL, {
                namespace: "cache",
              })
            : undefined,
        }),
    },
  ],
  exports: [Cacheable],
})
export class CacheModule {}
