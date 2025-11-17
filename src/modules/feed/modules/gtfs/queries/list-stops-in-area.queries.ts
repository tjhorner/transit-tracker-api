/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/list-stops-in-area.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'ListStopsInArea' parameters type */
export interface IListStopsInAreaParams {
  maxLat?: number | null | void
  maxLon?: number | null | void
  minLat?: number | null | void
  minLon?: number | null | void
}

/** 'ListStopsInArea' return type */
export interface IListStopsInAreaResult {
  stop_code: string | null
  stop_id: string
  stop_lat: number | null
  stop_lon: number | null
  stop_name: string | null
}

/** 'ListStopsInArea' query type */
export interface IListStopsInAreaQuery {
  params: IListStopsInAreaParams
  result: IListStopsInAreaResult
}

const listStopsInAreaIR: any = {
  usedParamSet: { minLat: true, maxLat: true, minLon: true, maxLon: true },
  params: [
    {
      name: "minLat",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 323, b: 329 }],
    },
    {
      name: "maxLat",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 335, b: 341 }],
    },
    {
      name: "minLon",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 366, b: 372 }],
    },
    {
      name: "maxLon",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 378, b: 384 }],
    },
  ],
  statement:
    'SELECT \n  stop_id, \n  stop_name, \n  stop_code, \n  stop_lat, \n  stop_lon\nFROM \n  "stops" stops\nWHERE\n  EXISTS (\n    -- filter by stops that are actually serviced by any trip\n    SELECT 1 FROM stop_times st\n    WHERE st.stop_id = stops.stop_id\n  )\n  AND stop_lat IS NOT NULL\n  AND stop_lon IS NOT NULL\n  AND stop_lat BETWEEN :minLat AND :maxLat\n  AND stop_lon BETWEEN :minLon AND :maxLon',
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
 *   "stops" stops
 * WHERE
 *   EXISTS (
 *     -- filter by stops that are actually serviced by any trip
 *     SELECT 1 FROM stop_times st
 *     WHERE st.stop_id = stops.stop_id
 *   )
 *   AND stop_lat IS NOT NULL
 *   AND stop_lon IS NOT NULL
 *   AND stop_lat BETWEEN :minLat AND :maxLat
 *   AND stop_lon BETWEEN :minLon AND :maxLon
 * ```
 */
export const listStopsInArea = new PreparedQuery<
  IListStopsInAreaParams,
  IListStopsInAreaResult
>(listStopsInAreaIR)
