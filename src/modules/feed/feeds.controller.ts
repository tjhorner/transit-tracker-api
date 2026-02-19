import { Controller, Get, UseInterceptors } from "@nestjs/common"
import { ApiProperty, ApiResponse } from "@nestjs/swagger"
import * as turf from "@turf/turf"
import { FeatureCollection } from "geojson"
import ms from "ms"
import { CacheTTL } from "../cache/decorators/cache-ttl.decorator"
import { CacheInterceptor } from "../cache/interceptors/cache.interceptor"
import exampleServiceAreas from "./example-service-areas.json"
import { FeedService } from "./feed.service"

class FeedDto {
  @ApiProperty({
    required: true,
    description: "The code used to identify this feed",
    example: "st",
  })
  code!: string

  @ApiProperty({
    required: true,
    nullable: true,
    description:
      "The last time this feed was synced (this can be null in cases where syncing is not necessary, such as with OneBusAway)",
    example: "2023-05-01T12:00:00Z",
    type: Date,
  })
  lastSyncedAt!: Date | null

  @ApiProperty({
    required: true,
    description: "Human-readable name for this feed",
    example: "Puget Sound Region",
  })
  name!: string

  @ApiProperty({
    required: false,
    description: "Human-readable description for this feed",
    example: "All public transit agencies in the Puget Sound region",
  })
  description?: string

  @ApiProperty({
    required: true,
    description:
      "Bounding box for this feed in the format [lon1, lat1, lon2, lat2]",
    isArray: true,
    type: Number,
    example: [-123.01475, 46.93304, -121.601001, 48.59793],
  })
  bounds!: number[]

  @ApiProperty({
    required: true,
    description: "Provider-specific metadata for this feed",
    type: Object,
    example: {},
  })
  metadata!: Record<string, any>
}

@Controller("feeds")
export class FeedsController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: "List of all feeds",
    type: [FeedDto],
  })
  async getFeeds(): Promise<FeedDto[]> {
    const feeds = this.feedService.getAllFeeds()

    const resp: FeedDto[] = []
    for (const [feedCode, feed] of Object.entries(feeds)) {
      const provider = this.feedService.getFeedProvider(feedCode)!
      const lastSync = await provider.getLastSync?.()
      const metadata = await provider.getMetadata?.()

      resp.push({
        code: feedCode,
        lastSyncedAt: lastSync ?? null,
        name: feed.name,
        description: feed.description,
        bounds: turf.bbox(await this.feedService.getServiceArea(feedCode)),
        metadata: metadata ?? {},
      })
    }

    return resp
  }

  @Get("service-areas")
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(ms("24h"))
  @ApiResponse({
    status: 200,
    description:
      "[GeoJSON](https://geojson.org/) `FeatureCollection` of `Polygon`s representing all available service areas combined",
    example: exampleServiceAreas,
  })
  async getServiceAreas(): Promise<FeatureCollection> {
    const feeds = this.feedService.getAllFeedProviders()
    const configs = this.feedService.getAllFeeds()

    const polygonFeatures = (
      await Promise.all(
        Object.entries(feeds).map(async ([feedKey, provider]) => {
          const config = configs[feedKey]
          if (config.serviceArea) {
            return turf.polygon(config.serviceArea)
          }

          const stops = (await provider.listStops?.()) ?? []
          return turf.convex(
            turf.featureCollection(
              stops.map((stop) => turf.point([stop.lon, stop.lat])),
            ),
          )
        }),
      )
    ).filter((feature) => feature !== null)

    if (polygonFeatures.length === 0) {
      return turf.featureCollection([])
    }

    if (polygonFeatures.length === 1) {
      return turf.featureCollection(polygonFeatures)
    }

    return turf.flatten(turf.union(turf.featureCollection(polygonFeatures))!)
  }
}
