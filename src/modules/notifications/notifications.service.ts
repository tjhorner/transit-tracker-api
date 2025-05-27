import { Injectable, Logger } from "@nestjs/common"
import { execFile } from "node:child_process"

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  async sendNotification(title: string, message: string) {
    this.logger.log(`System notification: ${title} - ${message}`)

    const targets = process.env.APPRISE_URLS
      ? process.env.APPRISE_URLS.split(" ")
      : []

    if (targets.length === 0) return
    return this.sendToTargets(targets, title, message)
  }

  private async sendToTargets(urls: string[], title: string, message: string) {
    return this.runCmd("apprise", ["-t", title, "-b", message, ...urls])
  }

  private runCmd(command: string, args: string[] = []) {
    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(command, args, (error, stdout, stderr) => {
          if (error) {
            reject(error)
          } else {
            resolve({ stdout, stderr })
          }
        })
      },
    )
  }
}
