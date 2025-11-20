import { Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { NotificationsService } from "./modules/notifications/notifications.service"

@Injectable()
export class SystemAlertListener {
  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent("feed.sync.error", { async: true })
  async handleFeedSyncError(event: { message: string; stack: string }) {
    const title = "Feed Sync Error"
    const message = `A fatal error occurred during feed sync:\n\n${event.message}\n\nStack trace:\n${event.stack}`
    await this.notificationsService.sendNotification(title, message)
  }

  @OnEvent("feed.sync.warn", { async: true })
  async handleFeedSyncWarn(event: {
    feedCode: string
    message: string
    stack: string
  }) {
    const title = `Feed Sync Warning - ${event.feedCode}`
    const message = `A warning occurred during feed sync for feed "${event.feedCode}":\n\n${event.message}\n\nStack trace:\n${event.stack}`
    await this.notificationsService.sendNotification(title, message)
  }

  @OnEvent("feed.sync.completed", { async: true })
  async handleFeedSyncCompleted() {
    const title = "Feed Sync Completed"
    const message = "Feed synchronization has completed successfully."
    await this.notificationsService.sendNotification(title, message)
  }
}
