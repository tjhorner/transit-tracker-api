import { BBox } from "geojson"

export interface RouteAtStop {
  routeId: string
  stopId: string
}

export interface TripStop {
  tripId: string
  stopId: string
  routeId: string
  routeName: string
  routeColor: string
  stopName: string
  headsign: string
  arrivalTime: Date
  departureTime: Date
  isRealtime: boolean
}

export interface Stop {
  stopId: string
  stopCode: string
  name: string
  lat: number
  lon: number
}

export interface StopRoute {
  routeId: string
  name: string
  color: string | null
  headsigns: string[]
}

export interface FeedProvider<TConfig = unknown> {
  init(feedCode: string, config: TConfig): void
  sync?(): Promise<void>

  healthCheck(): Promise<void>

  getUpcomingTripsForRoutesAtStops(routes: RouteAtStop[]): Promise<TripStop[]>

  getStop(stopId: string): Promise<Stop>
  getRoutesForStop(stopId: string): Promise<StopRoute[]>
  getStopsInArea(bbox: BBox): Promise<Stop[]>

  getAgencyBounds(): Promise<BBox>
}
