import { Module } from "@nestjs/common"
import { ScheduleController } from "./schedule/schedule.controller"
import { CacheModule } from "@nestjs/cache-manager"
import { StopsController } from "./stops/stops.controller"
import { ScheduleGateway } from "./schedule/schedule.gateway"
import { FeedModule } from "./modules/feed/feed.module"
import { createKeyv } from "@keyv/redis"
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { APP_GUARD } from "@nestjs/core"
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { BullModule } from "@nestjs/bullmq"
import { OpenTelemetryModule } from "nestjs-otel"

@Module({
  imports: [
    BullModule.forRoot({
      prefix: "bullmq",
      connection: {
        url: process.env.REDIS_URL,
      },
    }),
    CacheModule.register({
      isGlobal: true,
      useFactory: () => ({
        stores: [createKeyv(process.env.REDIS_URL, { namespace: "cache" })],
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers:
        process.env.DISABLE_RATE_LIMITS === "true"
          ? []
          : [
              { name: "short", ttl: seconds(1), limit: 10 },
              { name: "long", ttl: seconds(60), limit: 60 },
            ],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
    }),
    OpenTelemetryModule.forRoot({
      metrics: {
        hostMetrics: false,
        apiMetrics: {
          enable: true,
        },
      },
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
