/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/vacuum-tables.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'VacuumTables' parameters type */
export type IVacuumTablesParams = void

/** 'VacuumTables' return type */
export type IVacuumTablesResult = void

/** 'VacuumTables' query type */
export interface IVacuumTablesQuery {
  params: IVacuumTablesParams
  result: IVacuumTablesResult
}

const vacuumTablesIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    "VACUUM stop_times,\n  trips,\n  routes,\n  calendar_dates,\n  calendar,\n  stops,\n  agency,\n  feed_info,\n  import_metadata",
}

/**
 * Query generated from SQL:
 * ```
 * VACUUM stop_times,
 *   trips,
 *   routes,
 *   calendar_dates,
 *   calendar,
 *   stops,
 *   agency,
 *   feed_info,
 *   import_metadata
 * ```
 */
export const vacuumTables = new PreparedQuery<
  IVacuumTablesParams,
  IVacuumTablesResult
>(vacuumTablesIR)
