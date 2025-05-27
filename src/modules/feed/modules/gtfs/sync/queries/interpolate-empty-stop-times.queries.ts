/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/interpolate-empty-stop-times.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'EmptyArrivalTimesExist' parameters type */
export interface IEmptyArrivalTimesExistParams {
  feedCode: string
}

/** 'EmptyArrivalTimesExist' return type */
export interface IEmptyArrivalTimesExistResult {
  exists: boolean | null
}

/** 'EmptyArrivalTimesExist' query type */
export interface IEmptyArrivalTimesExistQuery {
  params: IEmptyArrivalTimesExistParams
  result: IEmptyArrivalTimesExistResult
}

const emptyArrivalTimesExistIR: any = {
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 103, b: 112 }],
    },
  ],
  statement:
    "SELECT EXISTS (\n  SELECT 1\n  FROM stop_times st\n  WHERE st.arrival_time IS NULL\n    AND st.feed_code = :feedCode!\n)",
}

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *   SELECT 1
 *   FROM stop_times st
 *   WHERE st.arrival_time IS NULL
 *     AND st.feed_code = :feedCode!
 * )
 * ```
 */
export const emptyArrivalTimesExist = new PreparedQuery<
  IEmptyArrivalTimesExistParams,
  IEmptyArrivalTimesExistResult
>(emptyArrivalTimesExistIR)

/** 'InterpolateEmptyArrivalTimes' parameters type */
export interface IInterpolateEmptyArrivalTimesParams {
  feedCode: string
}

/** 'InterpolateEmptyArrivalTimes' return type */
export type IInterpolateEmptyArrivalTimesResult = void

/** 'InterpolateEmptyArrivalTimes' query type */
export interface IInterpolateEmptyArrivalTimesQuery {
  params: IInterpolateEmptyArrivalTimesParams
  result: IInterpolateEmptyArrivalTimesResult
}

const interpolateEmptyArrivalTimesIR: any = {
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 2437, b: 2446 }],
    },
  ],
  statement:
    "WITH interp AS (\n  SELECT\n    st.feed_code,\n    st.trip_id,\n    st.stop_sequence,\n    st.shape_dist_traveled,\n    -- Get previous known arrival time as interval\n    (\n      SELECT s_prev.arrival_time\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_time,\n    -- Get next known arrival time as interval\n    (\n      SELECT s_next.arrival_time\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_time,\n    -- Get previous known shape_dist_traveled value\n    (\n      SELECT s_prev.shape_dist_traveled\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_shape,\n    -- Get next known shape_dist_traveled value\n    (\n      SELECT s_next.shape_dist_traveled\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_shape,\n    -- Get previous stop_sequence with known arrival\n    (\n      SELECT s_prev.stop_sequence\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_seq,\n    -- Get next stop_sequence with known arrival\n    (\n      SELECT s_next.stop_sequence\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_seq\n  FROM stop_times st\n  WHERE st.arrival_time IS NULL \n    AND st.feed_code = :feedCode!\n),\ncomputed AS (\n  SELECT\n    sub.feed_code,\n    sub.trip_id,\n    sub.stop_sequence,\n    sub.interpolated_arrival_time\n  FROM (\n    SELECT\n      i.*,\n      (\n        i.prev_time +\n        (\n          i.next_time - i.prev_time\n        ) * (\n          CASE\n            WHEN i.prev_shape IS NOT NULL AND i.next_shape IS NOT NULL THEN\n              (i.shape_dist_traveled - i.prev_shape) /\n              (i.next_shape - i.prev_shape)\n            ELSE\n              (i.stop_sequence - i.prev_seq)::numeric /\n              (i.next_seq - i.prev_seq)\n          END\n        )\n      ) AS interpolated_arrival_time\n    FROM interp i\n  ) sub\n)\nUPDATE stop_times st\nSET arrival_time = comp.interpolated_arrival_time\nFROM computed comp\nWHERE st.feed_code = comp.feed_code\n  AND st.trip_id = comp.trip_id\n  AND st.stop_sequence = comp.stop_sequence",
}

/**
 * Query generated from SQL:
 * ```
 * WITH interp AS (
 *   SELECT
 *     st.feed_code,
 *     st.trip_id,
 *     st.stop_sequence,
 *     st.shape_dist_traveled,
 *     -- Get previous known arrival time as interval
 *     (
 *       SELECT s_prev.arrival_time
 *       FROM stop_times s_prev
 *       WHERE s_prev.feed_code = st.feed_code
 *         AND s_prev.trip_id = st.trip_id
 *         AND s_prev.stop_sequence < st.stop_sequence
 *         AND s_prev.arrival_time IS NOT NULL
 *       ORDER BY s_prev.stop_sequence DESC
 *       LIMIT 1
 *     ) AS prev_time,
 *     -- Get next known arrival time as interval
 *     (
 *       SELECT s_next.arrival_time
 *       FROM stop_times s_next
 *       WHERE s_next.feed_code = st.feed_code
 *         AND s_next.trip_id = st.trip_id
 *         AND s_next.stop_sequence > st.stop_sequence
 *         AND s_next.arrival_time IS NOT NULL
 *       ORDER BY s_next.stop_sequence ASC
 *       LIMIT 1
 *     ) AS next_time,
 *     -- Get previous known shape_dist_traveled value
 *     (
 *       SELECT s_prev.shape_dist_traveled
 *       FROM stop_times s_prev
 *       WHERE s_prev.feed_code = st.feed_code
 *         AND s_prev.trip_id = st.trip_id
 *         AND s_prev.stop_sequence < st.stop_sequence
 *         AND s_prev.arrival_time IS NOT NULL
 *       ORDER BY s_prev.stop_sequence DESC
 *       LIMIT 1
 *     ) AS prev_shape,
 *     -- Get next known shape_dist_traveled value
 *     (
 *       SELECT s_next.shape_dist_traveled
 *       FROM stop_times s_next
 *       WHERE s_next.feed_code = st.feed_code
 *         AND s_next.trip_id = st.trip_id
 *         AND s_next.stop_sequence > st.stop_sequence
 *         AND s_next.arrival_time IS NOT NULL
 *       ORDER BY s_next.stop_sequence ASC
 *       LIMIT 1
 *     ) AS next_shape,
 *     -- Get previous stop_sequence with known arrival
 *     (
 *       SELECT s_prev.stop_sequence
 *       FROM stop_times s_prev
 *       WHERE s_prev.feed_code = st.feed_code
 *         AND s_prev.trip_id = st.trip_id
 *         AND s_prev.stop_sequence < st.stop_sequence
 *         AND s_prev.arrival_time IS NOT NULL
 *       ORDER BY s_prev.stop_sequence DESC
 *       LIMIT 1
 *     ) AS prev_seq,
 *     -- Get next stop_sequence with known arrival
 *     (
 *       SELECT s_next.stop_sequence
 *       FROM stop_times s_next
 *       WHERE s_next.feed_code = st.feed_code
 *         AND s_next.trip_id = st.trip_id
 *         AND s_next.stop_sequence > st.stop_sequence
 *         AND s_next.arrival_time IS NOT NULL
 *       ORDER BY s_next.stop_sequence ASC
 *       LIMIT 1
 *     ) AS next_seq
 *   FROM stop_times st
 *   WHERE st.arrival_time IS NULL
 *     AND st.feed_code = :feedCode!
 * ),
 * computed AS (
 *   SELECT
 *     sub.feed_code,
 *     sub.trip_id,
 *     sub.stop_sequence,
 *     sub.interpolated_arrival_time
 *   FROM (
 *     SELECT
 *       i.*,
 *       (
 *         i.prev_time +
 *         (
 *           i.next_time - i.prev_time
 *         ) * (
 *           CASE
 *             WHEN i.prev_shape IS NOT NULL AND i.next_shape IS NOT NULL THEN
 *               (i.shape_dist_traveled - i.prev_shape) /
 *               (i.next_shape - i.prev_shape)
 *             ELSE
 *               (i.stop_sequence - i.prev_seq)::numeric /
 *               (i.next_seq - i.prev_seq)
 *           END
 *         )
 *       ) AS interpolated_arrival_time
 *     FROM interp i
 *   ) sub
 * )
 * UPDATE stop_times st
 * SET arrival_time = comp.interpolated_arrival_time
 * FROM computed comp
 * WHERE st.feed_code = comp.feed_code
 *   AND st.trip_id = comp.trip_id
 *   AND st.stop_sequence = comp.stop_sequence
 * ```
 */
export const interpolateEmptyArrivalTimes = new PreparedQuery<
  IInterpolateEmptyArrivalTimesParams,
  IInterpolateEmptyArrivalTimesResult
>(interpolateEmptyArrivalTimesIR)

/** 'UpdateEmptyDepartureTimes' parameters type */
export interface IUpdateEmptyDepartureTimesParams {
  feedCode: string
}

/** 'UpdateEmptyDepartureTimes' return type */
export type IUpdateEmptyDepartureTimesResult = void

/** 'UpdateEmptyDepartureTimes' query type */
export interface IUpdateEmptyDepartureTimesQuery {
  params: IUpdateEmptyDepartureTimesParams
  result: IUpdateEmptyDepartureTimesResult
}

const updateEmptyDepartureTimesIR: any = {
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 130, b: 139 }],
    },
  ],
  statement:
    "UPDATE stop_times\nSET departure_time = arrival_time\nWHERE departure_time IS NULL\n  AND arrival_time IS NOT NULL\n  AND feed_code = :feedCode!",
}

/**
 * Query generated from SQL:
 * ```
 * UPDATE stop_times
 * SET departure_time = arrival_time
 * WHERE departure_time IS NULL
 *   AND arrival_time IS NOT NULL
 *   AND feed_code = :feedCode!
 * ```
 */
export const updateEmptyDepartureTimes = new PreparedQuery<
  IUpdateEmptyDepartureTimesParams,
  IUpdateEmptyDepartureTimesResult
>(updateEmptyDepartureTimesIR)
