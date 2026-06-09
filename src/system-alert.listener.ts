import { Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import {
  FeedSyncErrorEvent,
  FeedSyncService,
  FeedSyncWarnEvent,
} from "./modules/feed/feed-sync.service"
import { NotificationsService } from "./modules/notifications/notifications.service"

@Injectable()
export class SystemAlertListener {
  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(FeedSyncService.ErrorEvent, { async: true })
  async handleFeedSyncError(event: FeedSyncErrorEvent) {
    const title = "Feed Sync Error"
    const message = `A fatal error occurred during feed sync (Sentry ID: ${event.sentryId}):\n\n${event.message}`
    await this.notificationsService.sendNotification(title, message)
  }

  @OnEvent(FeedSyncService.WarnEvent, { async: true })
  async handleFeedSyncWarn(event: FeedSyncWarnEvent) {
    const title = `Feed Sync Warning - ${event.feedCode}`
    const message = `A warning occurred during feed sync for feed "${event.feedCode}" (Sentry ID: ${event.sentryId}):\n\n${event.message}`
    await this.notificationsService.sendNotification(title, message)
  }

  @OnEvent(FeedSyncService.CompletedEvent, { async: true })
  async handleFeedSyncCompleted() {
    const title = "Feed Sync Completed"
    const message = "Feed synchronization has completed successfully."
    await this.notificationsService.sendNotification(title, message)
  }
}
