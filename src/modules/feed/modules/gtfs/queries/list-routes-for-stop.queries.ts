/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/list-routes-for-stop.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json }

/** 'ListRoutesForStop' parameters type */
export interface IListRoutesForStopParams {
  stopId: string
}

/** 'ListRoutesForStop' return type */
export interface IListRoutesForStopResult {
  headsigns: Json | null
  route_color: string | null
  route_id: string
  route_long_name: string | null
  route_short_name: string | null
}

/** 'ListRoutesForStop' query type */
export interface IListRoutesForStopQuery {
  params: IListRoutesForStopParams
  result: IListRoutesForStopResult
}

const listRoutesForStopIR: any = {
  usedParamSet: { stopId: true },
  params: [
    {
      name: "stopId",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 417, b: 424 }],
    },
  ],
  statement:
    "SELECT\n  routes.route_id,\n  routes.route_short_name,\n  routes.route_long_name,\n  routes.route_color,\n  JSON_AGG(DISTINCT CASE \n    WHEN coalesce(TRIM(stop_times.stop_headsign), '') = '' THEN trips.trip_headsign\n    ELSE stop_times.stop_headsign\n  END) AS headsigns\nFROM stop_times\nINNER JOIN trips ON stop_times.trip_id = trips.trip_id\nINNER JOIN routes ON trips.route_id = routes.route_id\nWHERE stop_times.stop_id = :stopId!\nGROUP BY\n  routes.route_id,\n  routes.route_short_name,\n  routes.route_long_name,\n  routes.route_color\nORDER BY routes.route_short_name",
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   routes.route_id,
 *   routes.route_short_name,
 *   routes.route_long_name,
 *   routes.route_color,
 *   JSON_AGG(DISTINCT CASE
 *     WHEN coalesce(TRIM(stop_times.stop_headsign), '') = '' THEN trips.trip_headsign
 *     ELSE stop_times.stop_headsign
 *   END) AS headsigns
 * FROM stop_times
 * INNER JOIN trips ON stop_times.trip_id = trips.trip_id
 * INNER JOIN routes ON trips.route_id = routes.route_id
 * WHERE stop_times.stop_id = :stopId!
 * GROUP BY
 *   routes.route_id,
 *   routes.route_short_name,
 *   routes.route_long_name,
 *   routes.route_color
 * ORDER BY routes.route_short_name
 * ```
 */
export const listRoutesForStop = new PreparedQuery<
  IListRoutesForStopParams,
  IListRoutesForStopResult
>(listRoutesForStopIR)
