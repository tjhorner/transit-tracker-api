import { Controller, Get, Logger } from "@nestjs/common"

@Controller("healthz")
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  @Get()
  async healthCheck() {
    return { ok: true, timestamp: new Date().toISOString() }
  }
}
