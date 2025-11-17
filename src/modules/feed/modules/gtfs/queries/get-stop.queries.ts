/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/get-stop.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetStop' parameters type */
export interface IGetStopParams {
  stopId: string
}

/** 'GetStop' return type */
export interface IGetStopResult {
  stop_code: string | null
  stop_id: string
  stop_lat: number | null
  stop_lon: number | null
  stop_name: string | null
}

/** 'GetStop' query type */
export interface IGetStopQuery {
  params: IGetStopParams
  result: IGetStopResult
}

const getStopIR: any = {
  usedParamSet: { stopId: true },
  params: [
    {
      name: "stopId",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 100, b: 107 }],
    },
  ],
  statement:
    'SELECT\n  stop_id,\n  stop_name,\n  stop_code,\n  stop_lat,\n  stop_lon\nFROM\n  "stops"\nWHERE\n  stop_id = :stopId!\nLIMIT 1',
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
 *   stop_id = :stopId!
 * LIMIT 1
 * ```
 */
export const getStop = new PreparedQuery<IGetStopParams, IGetStopResult>(
  getStopIR,
)
