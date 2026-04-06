import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
} from "@nestjs/swagger"
import { featureCollection, point } from "@turf/turf"
import { FeedService } from "src/modules/feed/feed.service"
import { StopRoute } from "src/modules/feed/interfaces/feed-provider.interface"
import { ScheduleMetricsService } from "./schedule-metrics.service"
import { ScheduleService } from "./schedule.service"

export class TripDto {
  @ApiProperty({
    required: true,
    description:
      "The ID of the trip (note this is not globally unique and can be repeated for multiple days)",
    example: "st:1_123456",
  })
  tripId!: string

  @ApiProperty({
    required: true,
    description: "The ID of the route",
    example: "st:1_123456",
  })
  routeId!: string

  @ApiProperty({
    required: true,
    description: "The name of the route",
    example: "221",
  })
  routeName!: string

  @ApiProperty({
    required: true,
    nullable: true,
    description: "The color of the route",
    example: "FF0000",
  })
  routeColor!: string | null

  @ApiProperty({
    required: true,
    description: "The ID of the stop",
    example: "st:1_123456",
  })
  stopId!: string

  @ApiProperty({
    required: true,
    description: "The name of the stop",
    example: "Main St & 1st Ave",
  })
  stopName!: string

  @ApiProperty({
    required: true,
    description: "The headsign for the trip",
    example: "Downtown",
  })
  headsign!: string

  @ApiProperty({
    required: true,
    nullable: true,
    description: "The direction ID for the trip, if available",
    example: "0",
  })
  directionId!: string | null

  @ApiProperty({
    required: true,
    description: "The arrival time of the trip at the stop in Unix time",
    example: 1619029200,
  })
  arrivalTime!: number

  @ApiProperty({
    required: true,
    description: "The departure time of the trip at the stop in Unix time",
    example: 1619029200,
  })
  departureTime!: number

  @ApiProperty({
    required: true,
    description:
      "Whether the arrival and departure times are derived from real-time data or from the static schedule",
    example: true,
  })
  isRealtime!: boolean
}

export class ScheduleDto {
  @ApiProperty({
    isArray: true,
    type: TripDto,
    required: true,
  })
  trips!: TripDto[]
}

@Controller("schedule")
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly feedService: FeedService,
    private readonly metricsService: ScheduleMetricsService,
  ) {}

  @Get("subscribers")
  @ApiOperation({
    description:
      "Get the number of active schedule subscribers per route-stop pair",
  })
  @ApiOkResponse({
    description: "Subscriber counts keyed by routeId:stopId",
  })
  async getSubscriberCounts(): Promise<any> {
    const counts = await this.metricsService.getSubscriberCounts()

    const stopsToRoutes: Record<string, Record<string, number>> = {}
    const totalSubscribersForStop: Record<string, number> = {}

    for (const [routeStop, count] of Object.entries(counts)) {
      const [routeId, stopId] = routeStop
        .split(",")
        .map((part) => decodeURIComponent(part))

      if (!stopsToRoutes[stopId]) {
        stopsToRoutes[stopId] = {}
      }
      stopsToRoutes[stopId][routeId] = count

      if (!totalSubscribersForStop[stopId]) {
        totalSubscribersForStop[stopId] = 0
      }
      totalSubscribersForStop[stopId] += count
    }

    const feedProvider = this.feedService.all
    const stops = await Promise.all(
      Object.keys(stopsToRoutes).map(async (stopId) => {
        const stop = await feedProvider.getStop(stopId).catch(() => null)
        if (!stop) {
          return null
        }

        const routes: StopRoute[] = await feedProvider
          .getRoutesForStop(stopId)
          .catch(() => [])

        return point([stop?.lon, stop?.lat], {
          id: stopId,
          name: stop.name,
          totalSubscriberCount: totalSubscribersForStop[stopId] || 0,
          routes: routes.map((route) => ({
            id: route.routeId,
            name: route.name,
            subscriberCount: stopsToRoutes[stopId][route.routeId] || 0,
          })),
        })
      }),
    )

    return featureCollection(stops.filter((stop) => stop !== null) as any)
  }

  @Get(":routeStopPairs")
  @ApiOperation({
    description:
      "Get the combined schedule (upcoming arrivals and departures) for a list of route-stop pairs",
  })
  @ApiOkResponse({
    description: "List of upcoming trips",
    type: ScheduleDto,
  })
  @ApiBadRequestResponse()
  @ApiParam({
    name: "routeStopPairs",
    description:
      "A semicolon-separated list of `routeId,stopId` pairs to query",
    example: "st:1_100113,st:1_71971;st:1_102704,st:1_71971",
  })
  @ApiParam({
    name: "limit",
    description: "The maximum number of trips to return",
    example: 5,
    required: false,
  })
  async getArrivals(
    @Param("routeStopPairs") routeStopPairsRaw: string,
    @Query("limit") limit: number = 10,
  ): Promise<ScheduleDto> {
    limit = Math.min(limit, 10)

    const routeStopPairs =
      this.scheduleService.parseRouteStopPairs(routeStopPairsRaw)

    if (routeStopPairs.length > 25) {
      throw new BadRequestException("Too many route-stop pairs; maximum 25")
    }

    const schedule = await this.scheduleService.getSchedule({
      routes: routeStopPairs,
      limit,
    })

    const tripDtos: TripDto[] = schedule.trips
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .splice(0, limit)

    return {
      trips: tripDtos,
    }
  }
}
