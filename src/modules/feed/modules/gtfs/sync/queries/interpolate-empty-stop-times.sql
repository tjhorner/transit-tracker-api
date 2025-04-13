/* @name InterpolateEmptyArrivalTimes */
WITH interp AS (
  SELECT
    st.feed_code,
    st.trip_id,
    st.stop_sequence,
    st.shape_dist_traveled,
    -- Convert known arrival times to an interval
    (
      SELECT s_prev.arrival_time::interval
      FROM stop_times s_prev
      WHERE s_prev.feed_code = st.feed_code
        AND s_prev.trip_id = st.trip_id
        AND s_prev.stop_sequence < st.stop_sequence
        AND s_prev.arrival_time IS NOT NULL
      ORDER BY s_prev.stop_sequence DESC
      LIMIT 1
    ) AS prev_time,
    (
      SELECT s_next.arrival_time::interval
      FROM stop_times s_next
      WHERE s_next.feed_code = st.feed_code
        AND s_next.trip_id = st.trip_id
        AND s_next.stop_sequence > st.stop_sequence
        AND s_next.arrival_time IS NOT NULL
      ORDER BY s_next.stop_sequence ASC
      LIMIT 1
    ) AS next_time,
    (
      SELECT s_prev.shape_dist_traveled
      FROM stop_times s_prev
      WHERE s_prev.feed_code = st.feed_code
        AND s_prev.trip_id = st.trip_id
        AND s_prev.stop_sequence < st.stop_sequence
        AND s_prev.arrival_time IS NOT NULL
      ORDER BY s_prev.stop_sequence DESC
      LIMIT 1
    ) AS prev_shape,
    (
      SELECT s_next.shape_dist_traveled
      FROM stop_times s_next
      WHERE s_next.feed_code = st.feed_code
        AND s_next.trip_id = st.trip_id
        AND s_next.stop_sequence > st.stop_sequence
        AND s_next.arrival_time IS NOT NULL
      ORDER BY s_next.stop_sequence ASC
      LIMIT 1
    ) AS next_shape,
    (
      SELECT s_prev.stop_sequence
      FROM stop_times s_prev
      WHERE s_prev.feed_code = st.feed_code
        AND s_prev.trip_id = st.trip_id
        AND s_prev.stop_sequence < st.stop_sequence
        AND s_prev.arrival_time IS NOT NULL
      ORDER BY s_prev.stop_sequence DESC
      LIMIT 1
    ) AS prev_seq,
    (
      SELECT s_next.stop_sequence
      FROM stop_times s_next
      WHERE s_next.feed_code = st.feed_code
        AND s_next.trip_id = st.trip_id
        AND s_next.stop_sequence > st.stop_sequence
        AND s_next.arrival_time IS NOT NULL
      ORDER BY s_next.stop_sequence ASC
      LIMIT 1
    ) AS next_seq
  FROM stop_times st
  WHERE st.arrival_time IS NULL AND feed_code = :feedCode!
)
UPDATE stop_times st
SET arrival_time =
  (
    SELECT
      -- Compute the total seconds of the interpolated interval.
      -- We compute the interpolated interval as:
      --   prev_time + (next_time - prev_time) * fraction
      -- where the fraction comes from shape_dist_traveled differences, or fallback to stop_sequence.
      ( (total_seconds/3600)::int )::text
      || ':' ||
      to_char(
        (
          interval '1 second' * (total_seconds::int)
          - interval '1 hour' * ((total_seconds/3600)::int)
        )::time,
        'MI:SS'
      )
    FROM (
      SELECT
        extract(
          epoch FROM (
            interp.prev_time
            + (
                interp.next_time - interp.prev_time
              ) * (
                CASE
                  WHEN interp.prev_shape IS NOT NULL AND interp.next_shape IS NOT NULL THEN
                    (st.shape_dist_traveled - interp.prev_shape)
                    / (interp.next_shape - interp.prev_shape)
                  ELSE
                    (st.stop_sequence - interp.prev_seq)::numeric
                    / (interp.next_seq - interp.prev_seq)
                END
              )
          )
        ) AS total_seconds
      FROM interp
      WHERE interp.feed_code = st.feed_code
        AND interp.trip_id = st.trip_id
        AND interp.stop_sequence = st.stop_sequence
    ) sub
  )
WHERE EXISTS (
  SELECT 1 FROM interp
  WHERE interp.trip_id = st.trip_id
    AND interp.stop_sequence = st.stop_sequence
) AND feed_code = :feedCode!;

/* @name UpdateEmptyDepartureTimes */
UPDATE stop_times
SET departure_time = arrival_time
WHERE departure_time IS NULL
  AND arrival_time IS NOT NULL
  AND feed_code = :feedCode!;