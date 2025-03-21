import { Module } from "@nestjs/common"
import { ScheduleController } from "./schedule/schedule.controller"
import { CacheModule } from "@nestjs/cache-manager"
import { StopsController } from "./stops/stops.controller"
import { ScheduleGateway } from "./schedule/schedule.gateway"
import { FeedModule } from "./modules/feed/feed.module"
import { createKeyv as createKeyvRedis } from "@keyv/redis"
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { BullModule } from "@nestjs/bullmq"
import { OpenTelemetryModule } from "nestjs-otel"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { ScheduleService } from "./schedule/schedule.service"
import { ScheduleMetricsService } from "./schedule/schedule-metrics.service"
import { Cacheable, createKeyv as createKeyvMemory } from "cacheable"
import { HealthController } from "./health/health.controller"

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
        stores: [
          new Cacheable({
            primary: createKeyvMemory({
              lruSize: 5000,
              checkInterval: 3_600_000, // 1 hour
            }),
            secondary: process.env.REDIS_URL
              ? createKeyvRedis(process.env.REDIS_URL, {
                  namespace: "cache",
                })
              : undefined,
          }),
        ],
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
    SentryModule.forRoot(),
    FeedModule,
  ],
  controllers: [ScheduleController, StopsController, HealthController],
  providers: [
    ScheduleMetricsService,
    ScheduleService,
    ScheduleGateway,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
