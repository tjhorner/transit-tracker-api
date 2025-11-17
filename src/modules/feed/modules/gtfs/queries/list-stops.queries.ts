/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/list-stops.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'ListStops' parameters type */
export type IListStopsParams = void

/** 'ListStops' return type */
export interface IListStopsResult {
  stop_code: string | null
  stop_id: string
  stop_lat: number | null
  stop_lon: number | null
  stop_name: string | null
}

/** 'ListStops' query type */
export interface IListStopsQuery {
  params: IListStopsParams
  result: IListStopsResult
}

const listStopsIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    'SELECT\n  stop_id,\n  stop_name,\n  stop_code,\n  stop_lat,\n  stop_lon\nFROM\n  "stops"\nWHERE\n  stop_lat IS NOT NULL\n  AND stop_lon IS NOT NULL',
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   stop_id,
 *   stop_name,
 *   stop_code,
 *   stop_lat,
 *   stop_lon
 * FROM
 *   "stops"
 * WHERE
 *   stop_lat IS NOT NULL
 *   AND stop_lon IS NOT NULL
 * ```
 */
export const listStops = new PreparedQuery<IListStopsParams, IListStopsResult>(
  listStopsIR,
)
