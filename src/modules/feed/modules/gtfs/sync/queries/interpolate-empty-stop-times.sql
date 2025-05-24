/* @name EmptyArrivalTimesExist */
SELECT EXISTS (
  SELECT 1
  FROM stop_times st
  WHERE st.arrival_time IS NULL
    AND st.feed_code = :feedCode!
);

/* @name InterpolateEmptyArrivalTimes */
WITH interp AS (
  SELECT
    st.feed_code,
    st.trip_id,
    st.stop_sequence,
    st.shape_dist_traveled,
    -- Get previous known arrival time as interval
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
    -- Get next known arrival time as interval
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
    -- Get previous known shape_dist_traveled value
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
    -- Get next known shape_dist_traveled value
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
    -- Get previous stop_sequence with known arrival
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
    -- Get next stop_sequence with known arrival
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
  WHERE st.arrival_time IS NULL 
    AND st.feed_code = :feedCode!
),
computed AS (
  SELECT
    sub.feed_code,
    sub.trip_id,
    sub.stop_sequence,
    (
      ((sub.total_seconds / 3600)::int)::text
      || ':' ||
      to_char(
        (interval '1 second' * (sub.total_seconds::int)
         - interval '1 hour' * ((sub.total_seconds / 3600)::int)
        )::time,
        'MI:SS'
      )
    ) AS interpolated_arrival_time
  FROM (
    SELECT
      i.*,
      extract(
        epoch FROM (
          i.prev_time +
          (
            i.next_time - i.prev_time
          ) * (
            CASE
              WHEN i.prev_shape IS NOT NULL AND i.next_shape IS NOT NULL THEN
                (i.shape_dist_traveled - i.prev_shape) /
                (i.next_shape - i.prev_shape)
              ELSE
                (i.stop_sequence - i.prev_seq)::numeric /
                (i.next_seq - i.prev_seq)
            END
          )
        )
      ) AS total_seconds
    FROM interp i
  ) sub
)
UPDATE stop_times st
SET arrival_time = comp.interpolated_arrival_time
FROM computed comp
WHERE st.feed_code = comp.feed_code
  AND st.trip_id = comp.trip_id
  AND st.stop_sequence = comp.stop_sequence;

/* @name UpdateEmptyDepartureTimes */
UPDATE stop_times
SET departure_time = arrival_time
WHERE departure_time IS NULL
  AND arrival_time IS NOT NULL
  AND feed_code = :feedCode!;