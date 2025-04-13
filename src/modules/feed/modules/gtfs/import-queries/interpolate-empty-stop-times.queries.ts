/** Types generated for queries found in "src/modules/feed/modules/gtfs/import-queries/interpolate-empty-stop-times.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

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
      locs: [
        { a: 2199, b: 2208 },
        { a: 3730, b: 3739 },
      ],
    },
  ],
  statement:
    "WITH interp AS (\n  SELECT\n    st.feed_code,\n    st.trip_id,\n    st.stop_sequence,\n    st.shape_dist_traveled,\n    -- Convert known arrival times to an interval\n    (\n      SELECT s_prev.arrival_time::interval\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_time,\n    (\n      SELECT s_next.arrival_time::interval\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_time,\n    (\n      SELECT s_prev.shape_dist_traveled\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_shape,\n    (\n      SELECT s_next.shape_dist_traveled\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_shape,\n    (\n      SELECT s_prev.stop_sequence\n      FROM stop_times s_prev\n      WHERE s_prev.feed_code = st.feed_code\n        AND s_prev.trip_id = st.trip_id\n        AND s_prev.stop_sequence < st.stop_sequence\n        AND s_prev.arrival_time IS NOT NULL\n      ORDER BY s_prev.stop_sequence DESC\n      LIMIT 1\n    ) AS prev_seq,\n    (\n      SELECT s_next.stop_sequence\n      FROM stop_times s_next\n      WHERE s_next.feed_code = st.feed_code\n        AND s_next.trip_id = st.trip_id\n        AND s_next.stop_sequence > st.stop_sequence\n        AND s_next.arrival_time IS NOT NULL\n      ORDER BY s_next.stop_sequence ASC\n      LIMIT 1\n    ) AS next_seq\n  FROM stop_times st\n  WHERE st.arrival_time IS NULL AND feed_code = :feedCode!\n)\nUPDATE stop_times st\nSET arrival_time =\n  (\n    SELECT\n      -- Compute the total seconds of the interpolated interval.\n      -- We compute the interpolated interval as:\n      --   prev_time + (next_time - prev_time) * fraction\n      -- where the fraction comes from shape_dist_traveled differences, or fallback to stop_sequence.\n      ( (total_seconds/3600)::int )::text\n      || ':' ||\n      to_char(\n        (\n          interval '1 second' * (total_seconds::int)\n          - interval '1 hour' * ((total_seconds/3600)::int)\n        )::time,\n        'MI:SS'\n      )\n    FROM (\n      SELECT\n        extract(\n          epoch FROM (\n            interp.prev_time\n            + (\n                interp.next_time - interp.prev_time\n              ) * (\n                CASE\n                  WHEN interp.prev_shape IS NOT NULL AND interp.next_shape IS NOT NULL THEN\n                    (st.shape_dist_traveled - interp.prev_shape)\n                    / (interp.next_shape - interp.prev_shape)\n                  ELSE\n                    (st.stop_sequence - interp.prev_seq)::numeric\n                    / (interp.next_seq - interp.prev_seq)\n                END\n              )\n          )\n        ) AS total_seconds\n      FROM interp\n      WHERE interp.feed_code = st.feed_code\n        AND interp.trip_id = st.trip_id\n        AND interp.stop_sequence = st.stop_sequence\n    ) sub\n  )\nWHERE EXISTS (\n  SELECT 1 FROM interp\n  WHERE interp.trip_id = st.trip_id\n    AND interp.stop_sequence = st.stop_sequence\n) AND feed_code = :feedCode!",
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
 *     -- Convert known arrival times to an interval
 *     (
 *       SELECT s_prev.arrival_time::interval
 *       FROM stop_times s_prev
 *       WHERE s_prev.feed_code = st.feed_code
 *         AND s_prev.trip_id = st.trip_id
 *         AND s_prev.stop_sequence < st.stop_sequence
 *         AND s_prev.arrival_time IS NOT NULL
 *       ORDER BY s_prev.stop_sequence DESC
 *       LIMIT 1
 *     ) AS prev_time,
 *     (
 *       SELECT s_next.arrival_time::interval
 *       FROM stop_times s_next
 *       WHERE s_next.feed_code = st.feed_code
 *         AND s_next.trip_id = st.trip_id
 *         AND s_next.stop_sequence > st.stop_sequence
 *         AND s_next.arrival_time IS NOT NULL
 *       ORDER BY s_next.stop_sequence ASC
 *       LIMIT 1
 *     ) AS next_time,
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
 *   WHERE st.arrival_time IS NULL AND feed_code = :feedCode!
 * )
 * UPDATE stop_times st
 * SET arrival_time =
 *   (
 *     SELECT
 *       -- Compute the total seconds of the interpolated interval.
 *       -- We compute the interpolated interval as:
 *       --   prev_time + (next_time - prev_time) * fraction
 *       -- where the fraction comes from shape_dist_traveled differences, or fallback to stop_sequence.
 *       ( (total_seconds/3600)::int )::text
 *       || ':' ||
 *       to_char(
 *         (
 *           interval '1 second' * (total_seconds::int)
 *           - interval '1 hour' * ((total_seconds/3600)::int)
 *         )::time,
 *         'MI:SS'
 *       )
 *     FROM (
 *       SELECT
 *         extract(
 *           epoch FROM (
 *             interp.prev_time
 *             + (
 *                 interp.next_time - interp.prev_time
 *               ) * (
 *                 CASE
 *                   WHEN interp.prev_shape IS NOT NULL AND interp.next_shape IS NOT NULL THEN
 *                     (st.shape_dist_traveled - interp.prev_shape)
 *                     / (interp.next_shape - interp.prev_shape)
 *                   ELSE
 *                     (st.stop_sequence - interp.prev_seq)::numeric
 *                     / (interp.next_seq - interp.prev_seq)
 *                 END
 *               )
 *           )
 *         ) AS total_seconds
 *       FROM interp
 *       WHERE interp.feed_code = st.feed_code
 *         AND interp.trip_id = st.trip_id
 *         AND interp.stop_sequence = st.stop_sequence
 *     ) sub
 *   )
 * WHERE EXISTS (
 *   SELECT 1 FROM interp
 *   WHERE interp.trip_id = st.trip_id
 *     AND interp.stop_sequence = st.stop_sequence
 * ) AND feed_code = :feedCode!
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
