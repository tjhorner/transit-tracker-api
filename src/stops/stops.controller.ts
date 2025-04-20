import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseInterceptors,
} from "@nestjs/common"
import {
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
} from "@nestjs/swagger"
import * as turf from "@turf/turf"
import type { BBox } from "geojson"
import { InjectFeedProvider } from "src/decorators/feed-provider.decorator"
import { FeedProviderInterceptor } from "src/interceptors/feed-provider.interceptor"
import type { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"
import { ParseBboxPipe } from "src/pipes/parse-bbox.pipe"

class StopDto {
  @ApiProperty({
    required: true,
    description: "The ID of the stop",
    example: "st:1_71971",
  })
  stopId!: string

  @ApiProperty({
    required: true,
    nullable: true,
    type: String,
    description:
      "Rider-facing stop code if provided by transit agency, otherwise null",
    example: "71971",
  })
  stopCode!: string | null

  @ApiProperty({
    required: true,
    description: "The name of the stop",
    example: "NE Redmond Way & Bear Creek Pkwy",
  })
  name!: string

  @ApiProperty({
    required: true,
    description: "Latitude of the stop's location",
    example: 47.674011,
  })
  lat!: number

  @ApiProperty({
    required: true,
    description: "Longitude of the stop's location",
    example: -122.13089,
  })
  lon!: number
}

class StopRouteDto {
  @ApiProperty({
    required: true,
    description: "The ID of the route",
    example: "st:1_100113",
  })
  routeId!: string

  @ApiProperty({
    required: true,
    description: "The name of the route",
    example: "221",
  })
  name!: string

  @ApiProperty({
    required: true,
    nullable: true,
    description:
      "The color of the route if provided by the transit agency, otherwise null",
    example: "FDB71A",
  })
  color!: string | null

  @ApiProperty({
    required: true,
    description: "List of headsigns (destinations) for this route at this stop",
    example: ["Eastgate P&R"],
  })
  headsigns!: string[]
}

@Controller("stops")
@UseInterceptors(FeedProviderInterceptor)
export class StopsController {
  constructor() {}

  @Get("within/:bbox")
  @ApiOperation({
    description: "Search the specified bounding box for stops across all feeds",
  })
  @ApiParam({
    name: "bbox",
    type: String,
    example: "-122.133710,47.670636,-122.120089,47.676113",
    description: "Bounding box to search in the format lon1,lat1,lon2,lat2",
  })
  @ApiResponse({
    status: 200,
    description: "List of stops within the bounding box",
    type: StopDto,
    isArray: true,
  })
  @ApiResponse({
    status: 400,
    description: "Search area was too large",
    example: {
      message: "Search area too large (max 5km^2)",
      error: "Bad Request",
      statusCode: 400,
    },
  })
  async getStopsInBounds(
    @InjectFeedProvider() provider: FeedProvider,
    @Param("bbox", ParseBboxPipe) bbox: BBox,
  ): Promise<StopDto[]> {
    const polygon = turf.bboxPolygon(bbox)
    const area = turf.area(polygon)

    if (area / 1000000 > 5) {
      throw new BadRequestException("Search area too large (max 5km^2)")
    }

    const stops = await provider.getStopsInArea(bbox)
    return stops
  }

  @Get(":stopId/routes")
  @ApiOperation({
    description: "Get all routes that serve the specified stop",
  })
  @ApiParam({
    name: "stopId",
    type: String,
    example: "st:1_71971",
    description: "The ID of the stop to get routes for",
  })
  @ApiResponse({
    status: 200,
    description: "List of routes that serve the specified stop",
    type: StopRouteDto,
    isArray: true,
  })
  async getRoutesForStop(
    @InjectFeedProvider() provider: FeedProvider,
    @Param("stopId") stopId: string,
  ) {
    return provider.getRoutesForStop(stopId)
  }
}
