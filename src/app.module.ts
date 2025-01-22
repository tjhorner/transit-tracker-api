import { Module } from "@nestjs/common"
import { ScheduleController } from "./schedule/schedule.controller"
import { CacheModule } from "@nestjs/cache-manager"
import { StopsController } from "./stops/stops.controller"
import { ScheduleGateway } from "./schedule/schedule.gateway"
import { FeedModule } from "./modules/feed/feed.module"
import { Keyv } from "keyv"
import { createKeyv } from "@keyv/redis"
import { CacheableMemory } from "cacheable"
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { APP_GUARD } from "@nestjs/core"
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { BullModule } from "@nestjs/bullmq"

@Module({
  imports: [
    BullModule.forRoot({
      prefix: "bullmq",
      connection: {
        url: process.env.REDIS_URL,
      }
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            process.env.REDIS_URL
              ? createKeyv(process.env.REDIS_URL, { namespace: "cache" })
              : new Keyv({
                  store: new CacheableMemory(),
                }),
          ],
        }
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: seconds(60), limit: 30 }],
      storage: process.env.REDIS_URL
        ? new ThrottlerStorageRedisService(process.env.REDIS_URL)
        : undefined,
    }),
    FeedModule,
  ],
  controllers: [ScheduleController, StopsController],
  providers: [
    ScheduleGateway,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
