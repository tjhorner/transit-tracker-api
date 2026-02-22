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
    nullable: true,
    description: "The ID of the vehicle operating the trip, if real-time data is available",
    example: "320",
  })
  vehicle!: string | null

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
  constructor(private readonly scheduleService: ScheduleService) {}

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
