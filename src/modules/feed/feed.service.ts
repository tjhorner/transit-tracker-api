import { Injectable, Logger, OnModuleInit, Type } from "@nestjs/common"
import { ModuleRef } from "@nestjs/core"
import { GtfsService } from "src/modules/feed/modules/gtfs/gtfs.service"
import { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"
import { OneBusAwayService } from "src/modules/feed/modules/one-bus-away/one-bus-away.service"
import * as yaml from "js-yaml"
import fs from "fs/promises"

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

  constructor(private readonly moduleRef: ModuleRef) {}

  private async loadConfig(): Promise<{ [key: string]: FeedConfig }> {
    if (process.env.FEEDS_CONFIG) {
      return yaml.load(process.env.FEEDS_CONFIG)["feeds"]
    }

    const configFile = await fs.readFile("feeds.yaml", "utf-8")
    const config = yaml.load(configFile)
    return config["feeds"]
  }

  async onModuleInit() {
    const feeds = await this.loadConfig()
    this.feeds = feeds

    const providerTypeMap: { [key: string]: Type<FeedProvider> } = {
      gtfs: GtfsService,
      onebusaway: OneBusAwayService,
    }

    for (const [feedName, config] of Object.entries(feeds)) {
      for (const [key, providerType] of Object.entries(providerTypeMap)) {
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

  getFeedProvider(feedName: string): FeedProvider {
    return this.feedProviders.get(feedName)
  }

  getFeedProvidersOfType<T extends FeedProvider>(type: Type<T>): T[] {
    return Array.from(this.feedProviders.values()).filter(
      (provider) => provider instanceof type,
    ) as T[]
  }
}
