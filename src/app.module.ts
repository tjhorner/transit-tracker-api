import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { BeforeApplicationShutdown, Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { ScheduleModule } from "@nestjs/schedule"
import { seconds, ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { OpenTelemetryModule } from "nestjs-otel"
import { LoggerModule } from "nestjs-pino"
import { SmokeTestCommand } from "./commands/smoke-test.command"
import { SyncCommand } from "./commands/sync.command"
import { env } from "./env"
import { DomainExceptionFilter } from "./filters/domain-exception.filter"
import { HealthController } from "./health/health.controller"
import { CacheModule } from "./modules/cache/cache.module"
import { DateTimeModule } from "./modules/datetime/datetime.module"
import { FeedModule } from "./modules/feed/feed.module"
import { NotificationsModule } from "./modules/notifications/notifications.module"
import { ConnectionSheddingService } from "./schedule/connection-shedding.service"
import { CpuMonitorService } from "./schedule/cpu-monitor.service"
import { ScheduleMetricsController } from "./schedule/schedule-metrics.controller"
import { ScheduleMetricsService } from "./schedule/schedule-metrics.service"
import { ScheduleController } from "./schedule/schedule.controller"
import { ScheduleGateway } from "./schedule/schedule.gateway"
import { ScheduleService } from "./schedule/schedule.service"
import { StopsController } from "./stops/stops.controller"
import { SystemAlertListener } from "./system-alert.listener"
import otelSDK from "./tracing"

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.string("LOG_LEVEL", "info"),
        messageKey: "message",
        formatters: {
          level: (label) => ({ level: label }),
        },
        customProps: (req) => ({
          ipAddress: (req as unknown as { ip?: string }).ip,
        }),
        transport: env.boolean("LOG_JSON")
          ? undefined
          : {
              target: "pino-pretty",
              options: {
                singleLine: env.boolean("LOG_COMPACT"),
                messageKey: "message",
              },
            },
      },
    }),
    CacheModule,
    DateTimeModule,
    EventEmitterModule.forRoot({
      global: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: env.boolean("DISABLE_RATE_LIMITS")
          ? []
          : [
              { name: "short", ttl: seconds(1), limit: 10 },
              { name: "long", ttl: seconds(60), limit: 60 },
            ],
        storage: new ThrottlerStorageRedisService(env.string("REDIS_URL")),
      }),
    }),
    OpenTelemetryModule.forRoot({
      metrics: {
        hostMetrics: false,
      },
    }),
    SentryModule.forRoot(),
    FeedModule,
    NotificationsModule,
  ],
  controllers: [
    ScheduleController,
    ScheduleMetricsController,
    StopsController,
    HealthController,
  ],
  providers: [
    SyncCommand,
    SmokeTestCommand,
    ScheduleMetricsService,
    SystemAlertListener,
    ScheduleService,
    ScheduleGateway,
    CpuMonitorService,
    ConnectionSheddingService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_FILTER,
      useClass: DomainExceptionFilter,
    },
  ],
})
export class AppModule implements BeforeApplicationShutdown {
  async beforeApplicationShutdown() {
    await otelSDK.shutdown()
  }
}
