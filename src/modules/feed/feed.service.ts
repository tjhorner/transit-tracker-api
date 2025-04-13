import { Injectable, Logger, OnModuleInit, Type } from "@nestjs/common"
import { ContextIdFactory, DiscoveryService, ModuleRef } from "@nestjs/core"
import * as turf from "@turf/turf"
import fs from "fs/promises"
import { BBox } from "geojson"
import * as yaml from "js-yaml"
import {
  FeedContext,
  FeedProvider,
} from "src/modules/feed/interfaces/feed-provider.interface"
import { AllFeedsService } from "./all-feeds.service"
import { ProviderKey } from "./decorators/feed-provider.decorator"

export interface FeedConfig {
  name: string
  description?: string
  [key: string]: unknown
}

@Injectable()
export class FeedService implements OnModuleInit {
  /**
   * A meta-FeedProvider that aggregates all other FeedProviders.
   * IDs returned by this provider are prefixed with the feed code of the provider
   * that provided the data.
   */
  readonly all: FeedProvider

  private readonly logger = new Logger(FeedService.name, { timestamp: true })

  private feeds: { [key: string]: FeedConfig } = {}
  private feedProviders: Map<string, FeedProvider> = new Map()

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly discoveryService: DiscoveryService,
  ) {
    this.all = new AllFeedsService(this)
  }

  private async loadConfig(): Promise<{ [key: string]: FeedConfig }> {
    if (process.env.FEEDS_CONFIG) {
      this.logger.verbose(
        "Loading feeds from FEEDS_CONFIG environment variable",
      )

      const parsedYaml = yaml.load(process.env.FEEDS_CONFIG) as any
      return parsedYaml["feeds"]
    }

    this.logger.verbose("Loading feeds from feeds.yaml file")

    const configFile = await fs.readFile("feeds.yaml", "utf-8")
    const config = yaml.load(configFile) as any
    return config["feeds"]
  }

  private getRegisteredProviders() {
    const registeredProviders: { [key: string]: Type<FeedProvider> } =
      Object.fromEntries(
        this.discoveryService
          .getProviders({
            metadataKey: ProviderKey.KEY,
          })
          .map((item) => [
            this.discoveryService.getMetadataByDecorator(ProviderKey, item),
            item.metatype as Type<FeedProvider>,
          ]),
      )

    return registeredProviders
  }

  async onModuleInit() {
    const registeredProviders = this.getRegisteredProviders()
    for (const [providerType, provider] of Object.entries(
      registeredProviders,
    )) {
      this.logger.verbose(
        `Discovered feed provider type "${providerType}" (${provider.name})`,
      )
    }

    const feeds = await this.loadConfig()
    this.feeds = feeds

    this.logger.log(`Loaded ${Object.keys(feeds).length} feeds`)

    for (const [feedName, config] of Object.entries(feeds)) {
      for (const [key, providerType] of Object.entries(registeredProviders)) {
        if (config[key]) {
          this.logger.log(
            `Initializing feed "${feedName}" with provider ${providerType.name}`,
          )

          const contextId = ContextIdFactory.create()
          this.moduleRef.registerRequestByContextId<FeedContext>(
            {
              feedCode: feedName,
              config: config[key],
            },
            contextId,
          )

          let provider: FeedProvider
          try {
            provider = await this.moduleRef.resolve(providerType, contextId, {
              strict: false,
            })
          } catch (e: any) {
            this.logger.error(
              `Error initializing feed "${feedName}" with provider ${providerType.name}: ${e.message}`,
              e.stack,
            )
            break
          }

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

  getFeedProvider(feedName: string): FeedProvider | undefined {
    return this.feedProviders.get(feedName)
  }

  getFeedProvidersOfType<T extends FeedProvider>(type: Type<T>): T[] {
    return Array.from(this.feedProviders.values()).filter(
      (provider) => provider instanceof type,
    ) as T[]
  }

  async getFeedProvidersInBounds(targetBbox: BBox): Promise<
    {
      feedCode: string
      provider: FeedProvider
    }[]
  > {
    const providersInBounds = await Promise.all(
      Array.from(this.feedProviders.entries()).map(
        async ([feedCode, provider]) => {
          const agencyBbox = await provider.getAgencyBounds()
          if (
            agencyBbox &&
            turf.booleanIntersects(
              turf.bboxPolygon(agencyBbox),
              turf.bboxPolygon(targetBbox),
            )
          ) {
            return { feedCode, provider }
          }

          return null
        },
      ),
    )

    return providersInBounds.filter((e) => e !== null)
  }
}
