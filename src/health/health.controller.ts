import { Controller, Get, Logger } from "@nestjs/common"
import { SkipThrottle } from "@nestjs/throttler"

@SkipThrottle()
@Controller("healthz")
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  @Get()
  async healthCheck() {
    return { ok: true, timestamp: new Date().toISOString() }
  }
}
