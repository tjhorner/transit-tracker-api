import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseInterceptors,
} from "@nestjs/common"
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiParam,
  ApiProperty,
} from "@nestjs/swagger"
import { ScheduleProviderParam } from "src/decorators/schedule-provider"
import { ScheduleProviderInterceptor } from "src/interceptors/schedule-provider"
import { ScheduleProvider } from "src/interfaces/schedule-provider.interface"

export class Trip {
  @ApiProperty({
    required: true,
    description:
      "The ID of the trip (note this is not globally unique and can be repeated for multiple days)",
    example: "1_123456",
  })
  tripId: string

  @ApiProperty({
    required: true,
    description: "The ID of the route",
    example: "1_123456",
  })
  routeId: string

  @ApiProperty({
    required: true,
    description: "The name of the route",
    example: "221",
  })
  routeName: string

  @ApiProperty({
    required: true,
    nullable: true,
    description: "The color of the route",
    example: "FF0000",
  })
  routeColor: string

  @ApiProperty({
    required: true,
    description: "The ID of the stop",
    example: "1_123456",
  })
  stopId: string

  @ApiProperty({
    required: true,
    description: "The name of the stop",
    example: "Main St & 1st Ave",
  })
  stopName: string

  @ApiProperty({
    required: true,
    description: "The headsign for the trip",
    example: "Downtown",
  })
  headsign: string

  @ApiProperty({
    required: true,
    description: "The arrival time of the trip at the stop in Unix time",
    example: 1619029200,
  })
  arrivalTime: number

  @ApiProperty({
    required: true,
    description: "The departure time of the trip at the stop in Unix time",
    example: 1619029200,
  })
  departureTime: number

  @ApiProperty({
    required: true,
    description: "A human-readable countdown text for the arrival time",
    example: "5min",
  })
  countdownText: string

  @ApiProperty({
    required: true,
    description:
      "Whether the arrival and departure times are derived from real-time data or from the static schedule",
    example: true,
  })
  isRealtime: boolean
}

export class Trips {
  @ApiProperty({
    isArray: true,
    type: Trip,
    required: true,
  })
  trips: Trip[]
}

@Controller("schedule/:feedCode")
@UseInterceptors(ScheduleProviderInterceptor)
export class ScheduleController {
  constructor() {}

  private getCountdownText(arrivalTime: Date): string {
    const now = new Date()
    const diff = arrivalTime.getTime() - now.getTime()
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor(diff / 1000)

    if (hours > 0) {
      return `${hours}h${minutes % 60}m`
    }

    if (minutes === 0 && seconds <= 30) {
      return "Now"
    }

    return `${minutes}min`
  }

  @Get(":routeStopPairs")
  @ApiOkResponse({
    description: "List of upcoming trips",
    type: Trips,
  })
  @ApiBadRequestResponse()
  @ApiParam({
    name: "feedCode",
    description: "The code of the feed to query",
    example: "st",
  })
  @ApiParam({
    name: "routeStopPairs",
    description: "A semicolon-separated list of routeId,stopId pairs to query",
    example: "1_100113,1_71971;1_102704,1_71971",
  })
  @ApiParam({
    name: "limit",
    description: "The maximum number of trips to return",
    example: 5,
    required: false,
  })
  async getArrivals(
    @ScheduleProviderParam() scheduleProvider: ScheduleProvider,
    @Param("routeStopPairs") routeStopPairsRaw: string,
    @Query("limit") limit: number = 10,
  ): Promise<Trips> {
    limit = Math.min(limit, 10)

    const routeStopPairs = routeStopPairsRaw
      .split(";")
      .map((pair) => pair.split(",").map((part) => part.trim()))

    if (routeStopPairs.length > 5) {
      throw new BadRequestException("Too many route-stop pairs; maximum 5")
    }

    const upcomingTrips =
      await scheduleProvider.getUpcomingTripsForRoutesAtStops(
        routeStopPairs.map(([routeId, stopId]) => ({ routeId, stopId })),
      )

    const tripDtos: Trip[] = upcomingTrips
      .map((trip) => ({
        ...trip,
        arrivalTime: new Date(trip.arrivalTime).getTime() / 1000,
        departureTime: new Date(trip.departureTime).getTime() / 1000,
        countdownText: this.getCountdownText(new Date(trip.arrivalTime)),
      }))
      .sort((a, b) => a.arrivalTime - b.arrivalTime)
      .splice(0, limit)

    return {
      trips: tripDtos,
    }
  }
}
