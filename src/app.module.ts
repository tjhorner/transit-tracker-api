import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { ScheduleModule } from "@nestjs/schedule"
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { OpenTelemetryModule } from "nestjs-otel"
import { SyncCommand } from "./commands/sync.command"
import { HealthController } from "./health/health.controller"
import { CacheModule } from "./modules/cache/cache.module"
import { FeedModule } from "./modules/feed/feed.module"
import { NotificationsModule } from "./modules/notifications/notifications.module"
import { ScheduleMetricsService } from "./schedule/schedule-metrics.service"
import { ScheduleController } from "./schedule/schedule.controller"
import { ScheduleGateway } from "./schedule/schedule.gateway"
import { ScheduleService } from "./schedule/schedule.service"
import { StopsController } from "./stops/stops.controller"
import { SystemAlertListener } from "./system-alert.listener"

@Module({
  imports: [
    CacheModule,
    EventEmitterModule.forRoot({
      global: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers:
          process.env.DISABLE_RATE_LIMITS === "true"
            ? []
            : [
                { name: "short", ttl: seconds(1), limit: 10 },
                { name: "long", ttl: seconds(60), limit: 60 },
              ],
        storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
      }),
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
    NotificationsModule,
  ],
  controllers: [ScheduleController, StopsController, HealthController],
  providers: [
    SyncCommand,
    ScheduleMetricsService,
    SystemAlertListener,
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
