import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseInterceptors,
} from "@nestjs/common"
import * as turf from "@turf/turf"
import type { BBox } from "geojson"
import { InjectFeedProvider } from "src/decorators/feed-provider.decorator"
import { FeedProviderInterceptor } from "src/interceptors/feed-provider.interceptor"
import type { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"
import { ParseBboxPipe } from "src/pipes/parse-bbox.pipe"

@Controller("stops")
@UseInterceptors(FeedProviderInterceptor)
export class StopsController {
  constructor() {}

  @Get("within/:bbox")
  async getStopsInBounds(
    @InjectFeedProvider() provider: FeedProvider,
    @Param("bbox", ParseBboxPipe) bbox: BBox,
  ) {
    const polygon = turf.bboxPolygon(bbox)
    const area = turf.area(polygon)

    if (area / 1000000 > 5) {
      throw new BadRequestException("Search area too large (max 5km^2)")
    }

    const stops = await provider.getStopsInArea(bbox)
    return stops
  }

  @Get(":stopId/routes")
  async getRoutesForStop(
    @InjectFeedProvider() provider: FeedProvider,
    @Param("stopId") stopId: string,
  ) {
    return provider.getRoutesForStop(stopId)
  }
}
