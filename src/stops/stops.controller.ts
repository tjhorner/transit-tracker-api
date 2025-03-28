import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  UseInterceptors,
} from "@nestjs/common"
import * as turf from "@turf/turf"
import { InjectFeedProvider } from "src/decorators/feed-provider.decorator"
import { FeedProviderInterceptor } from "src/interceptors/feed-provider.interceptor"
import { FeedProvider } from "src/modules/feed/interfaces/feed-provider.interface"

@Controller("stops/:feedCode")
@UseInterceptors(FeedProviderInterceptor)
export class StopsController {
  constructor() {}

  @Get("within/:lat1/:lon1/:lat2/:lon2")
  async getStopsInBounds(
    @InjectFeedProvider() provider: FeedProvider,
    @Param("lat1", ParseFloatPipe) lat1: number,
    @Param("lon1", ParseFloatPipe) lon1: number,
    @Param("lat2", ParseFloatPipe) lat2: number,
    @Param("lon2", ParseFloatPipe) lon2: number,
  ) {
    const bbox = turf.bboxPolygon([lat1, lon1, lat2, lon2])
    const area = turf.area(bbox)

    if (area / 1000000 > 5) {
      throw new BadRequestException("Search area too large (max 5km^2)")
    }

    const stops = await provider.getStopsInArea([lat1, lon1, lat2, lon2])
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
