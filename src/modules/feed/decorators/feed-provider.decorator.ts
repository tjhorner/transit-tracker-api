import { DiscoveryService } from "@nestjs/core"

export const RegisterFeedProvider = DiscoveryService.createDecorator<string>()
