import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  UseInterceptors,
} from "@nestjs/common"
import * as turf from "@turf/turf"
import { ScheduleProviderParam } from "src/decorators/schedule-provider"
import { ScheduleProviderInterceptor } from "src/interceptors/schedule-provider"
import { ScheduleProvider } from "src/interfaces/schedule-provider.interface"

@Controller("stops/:feedCode")
@UseInterceptors(ScheduleProviderInterceptor)
export class StopsController {
  constructor() {}

  @Get("within/:lat1/:lon1/:lat2/:lon2")
  async getStopsInBounds(
    @ScheduleProviderParam() provider: ScheduleProvider,
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
    @ScheduleProviderParam() provider: ScheduleProvider,
    @Param("stopId") stopId: string,
  ) {
    return provider.getRoutesForStop(stopId)
  }
}
