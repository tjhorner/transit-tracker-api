/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/get-stop-bounds.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetStopBounds' parameters type */
export type IGetStopBoundsParams = void

/** 'GetStopBounds' return type */
export interface IGetStopBoundsResult {
  max_lat: number | null
  max_lon: number | null
  min_lat: number | null
  min_lon: number | null
}

/** 'GetStopBounds' query type */
export interface IGetStopBoundsQuery {
  params: IGetStopBoundsParams
  result: IGetStopBoundsResult
}

const getStopBoundsIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    "SELECT\n  MIN(stop_lat) AS min_lat,\n  MIN(stop_lon) AS min_lon,\n  MAX(stop_lat) AS max_lat,\n  MAX(stop_lon) AS max_lon\nFROM\n  stops",
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   MIN(stop_lat) AS min_lat,
 *   MIN(stop_lon) AS min_lon,
 *   MAX(stop_lat) AS max_lat,
 *   MAX(stop_lon) AS max_lon
 * FROM
 *   stops
 * ```
 */
export const getStopBounds = new PreparedQuery<
  IGetStopBoundsParams,
  IGetStopBoundsResult
>(getStopBoundsIR)
