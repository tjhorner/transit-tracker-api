import { Controller, Get, UseInterceptors } from "@nestjs/common"
import { FeedService } from "./feed.service"
import { ApiProperty, ApiResponse } from "@nestjs/swagger"
import { FeatureCollection } from "geojson"
import * as turf from "@turf/turf"
import { CacheInterceptor, CacheTTL } from "@nestjs/cache-manager"

class Feed {
  @ApiProperty({
    required: true,
    description: "The code used to identify this feed",
    example: "st",
  })
  code!: string

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
      "Bounding box for this feed in the format [lat1, lon1, lat2, lon2]",
    isArray: true,
    type: Number,
    example: [46.93304, -123.01475, 48.59793, -121.601001],
  })
  bounds!: number[]
}

@Controller("feeds")
export class FeedsController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: "List of all feeds",
    type: [Feed],
  })
  async getFeeds(): Promise<Feed[]> {
    const feeds = this.feedService.getAllFeeds()

    const resp: Feed[] = []
    for (const [feedCode, feed] of Object.entries(feeds)) {
      const provider = this.feedService.getFeedProvider(feedCode)!
      resp.push({
        code: feedCode,
        name: feed.name,
        description: feed.description,
        bounds: await provider.getAgencyBounds(),
      })
    }

    return resp
  }

  @Get("service-areas")
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60 * 60 * 24) // 24 hours
  async getServiceAreas(): Promise<FeatureCollection> {
    const feeds = this.feedService.getAllFeedProviders()

    const polygonFeatures = (
      await Promise.all(
        Object.entries(feeds).map(async ([, provider]) => {
          const stops = await provider.listStops()
          return turf.convex(
            turf.featureCollection(
              stops.map((stop) => turf.point([stop.lon, stop.lat])),
            ),
          )
        }),
      )
    ).filter((feature) => feature !== null)

    return turf.featureCollection([
      turf.union(turf.featureCollection(polygonFeatures))!,
    ])
  }
}
