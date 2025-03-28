import { Injectable, Logger, OnModuleInit, Type } from "@nestjs/common"
import { DiscoveryService, ModuleRef } from "@nestjs/core"
import { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"
import * as yaml from "js-yaml"
import fs from "fs/promises"
import { RegisterFeedProvider } from "./decorators/feed-provider.decorator"

export interface FeedConfig {
  name: string
  description?: string
  [key: string]: unknown
}

@Injectable()
export class FeedService implements OnModuleInit {
  private readonly logger = new Logger(FeedService.name)

  private feeds: { [key: string]: FeedConfig } = {}
  private feedProviders: Map<string, FeedProvider> = new Map()

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly discoveryService: DiscoveryService,
  ) {}

  private async loadConfig(): Promise<{ [key: string]: FeedConfig }> {
    if (process.env.FEEDS_CONFIG) {
      return yaml.load(process.env.FEEDS_CONFIG)["feeds"]
    }

    const configFile = await fs.readFile("feeds.yaml", "utf-8")
    const config = yaml.load(configFile)
    return config["feeds"]
  }

  private getRegisteredProviders() {
    const registeredProviders: { [key: string]: Type<FeedProvider> } =
      Object.fromEntries(
        this.discoveryService
          .getProviders({
            metadataKey: RegisterFeedProvider.KEY,
          })
          .map((item) => [
            this.discoveryService.getMetadataByDecorator(
              RegisterFeedProvider,
              item,
            ),
            item.metatype as Type<FeedProvider>,
          ]),
      )

    return registeredProviders
  }

  async onModuleInit() {
    const feeds = await this.loadConfig()
    this.feeds = feeds

    const registeredProviders = this.getRegisteredProviders()
    for (const [providerType, provider] of Object.entries(
      registeredProviders,
    )) {
      this.logger.log(
        `Discovered feed provider "${providerType}" (${provider.name})`,
      )
    }

    for (const [feedName, config] of Object.entries(feeds)) {
      for (const [key, providerType] of Object.entries(registeredProviders)) {
        if (config[key]) {
          this.logger.log(
            `Initializing feed "${feedName}" with provider ${providerType.name}`,
          )
          const provider = await this.moduleRef.create(providerType)
          provider.init(feedName, config[key])
          this.feedProviders.set(feedName, provider)
          break
        }
      }
    }
  }

  getAllFeeds(): { [key: string]: FeedConfig } {
    return this.feeds
  }

  getAllFeedProviders(): { [key: string]: FeedProvider } {
    return Object.fromEntries(this.feedProviders.entries())
  }

  getFeedProvider(feedName: string): FeedProvider {
    return this.feedProviders.get(feedName)
  }

  getFeedProvidersOfType<T extends FeedProvider>(type: Type<T>): T[] {
    return Array.from(this.feedProviders.values()).filter(
      (provider) => provider instanceof type,
    ) as T[]
  }
}
