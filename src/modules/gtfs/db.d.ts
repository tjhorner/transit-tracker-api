/**
 * This file was generated by kysely-codegen.
 * Please do not edit it manually.
 */

import type { ColumnType } from "kysely"

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface Agency {
  agency_email: string | null
  agency_fare_url: string | null
  agency_id: Generated<string>
  agency_lang: string | null
  agency_name: string
  agency_phone: string | null
  agency_timezone: string
  agency_url: string
  feed_code: string
}

export interface Calendar {
  end_date: Timestamp
  feed_code: string
  friday: number
  monday: number
  saturday: number
  service_id: string
  start_date: Timestamp
  sunday: number
  thursday: number
  tuesday: number
  wednesday: number
}

export interface CalendarDates {
  date: Timestamp
  exception_type: number
  feed_code: string
  service_id: string
}

export interface FeedInfo {
  feed_code: string
  feed_end_date: Timestamp | null
  feed_lang: string | null
  feed_publisher_name: string | null
  feed_publisher_url: string | null
  feed_start_date: Timestamp | null
  feed_version: string | null
}

export interface ImportMetadata {
  etag: string | null
  feed_code: string
  last_modified: Timestamp | null
}

export interface Routes {
  agency_id: Generated<string>
  continuous_drop_off: number | null
  continuous_pickup: number | null
  feed_code: string
  network_id: string | null
  route_color: string | null
  route_desc: string | null
  route_id: string
  route_long_name: string | null
  route_short_name: string | null
  route_sort_order: number | null
  route_text_color: string | null
  route_type: number | null
  route_url: string | null
}

export interface Stops {
  feed_code: string
  location_type: number | null
  parent_station: string | null
  stop_code: string | null
  stop_desc: string | null
  stop_id: string
  stop_lat: number | null
  stop_lon: number | null
  stop_name: string | null
  stop_timezone: string | null
  stop_url: string | null
  wheelchair_boarding: number | null
  zone_id: string | null
}

export interface StopTimes {
  arrival_time: string | null
  departure_time: string | null
  drop_off_type: number | null
  feed_code: string
  pickup_type: number | null
  shape_dist_traveled: number | null
  stop_headsign: string | null
  stop_id: string
  stop_sequence: number
  timepoint: number | null
  trip_id: string
}

export interface Trips {
  bikes_allowed: number | null
  block_id: string | null
  direction_id: number | null
  fare_id: string | null
  feed_code: string
  peak_flag: number | null
  route_id: string | null
  service_id: string | null
  shape_id: string | null
  trip_headsign: string | null
  trip_id: string
  trip_short_name: string | null
  wheelchair_accessible: number | null
}

export interface DB {
  agency: Agency
  calendar: Calendar
  calendar_dates: CalendarDates
  feed_info: FeedInfo
  import_metadata: ImportMetadata
  routes: Routes
  stop_times: StopTimes
  stops: Stops
  trips: Trips
}
