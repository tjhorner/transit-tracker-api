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
  routeColor: string | null
  stopName: string
  headsign: string
  arrivalTime: Date
  departureTime: Date
  vehicle: string | null
  isRealtime: boolean
}

export interface Stop {
  stopId: string
  stopCode: string | null
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

export interface FeedContext<TConfig = unknown> {
  feedCode: string
  config: TConfig
}

export interface SyncOptions {
  force?: boolean
}

export interface FeedProvider {
  sync?(opts?: SyncOptions): Promise<void>
  getLastSync?(): Promise<Date | null>
  getMetadata?(): Promise<Record<string, any>>

  healthCheck(): Promise<void>

  getUpcomingTripsForRoutesAtStops(routes: RouteAtStop[]): Promise<TripStop[]>

  listStops?(): Promise<Stop[]>
  getStop(stopId: string): Promise<Stop>
  getRoutesForStop(stopId: string): Promise<StopRoute[]>
  getStopsInArea(bbox: BBox): Promise<Stop[]>

  getAgencyBounds?(): Promise<BBox>
}
