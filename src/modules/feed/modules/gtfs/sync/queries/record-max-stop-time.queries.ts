/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/record-max-stop-time.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'RecordMaxStopTime' parameters type */
export interface IRecordMaxStopTimeParams {
  feedCode: string
}

/** 'RecordMaxStopTime' return type */
export type IRecordMaxStopTimeResult = void

/** 'RecordMaxStopTime' query type */
export interface IRecordMaxStopTimeQuery {
  params: IRecordMaxStopTimeParams
  result: IRecordMaxStopTimeResult
}

const recordMaxStopTimeIR: any = {
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 138, b: 147 }],
    },
  ],
  statement:
    'UPDATE import_metadata\nSET max_stop_time = (\n  SELECT MAX(GREATEST(arrival_time, departure_time))\n  FROM "stop_times"\n)\nWHERE feed_code = :feedCode!',
}

/**
 * Query generated from SQL:
 * ```
 * UPDATE import_metadata
 * SET max_stop_time = (
 *   SELECT MAX(GREATEST(arrival_time, departure_time))
 *   FROM "stop_times"
 * )
 * WHERE feed_code = :feedCode!
 * ```
 */
export const recordMaxStopTime = new PreparedQuery<
  IRecordMaxStopTimeParams,
  IRecordMaxStopTimeResult
>(recordMaxStopTimeIR)
