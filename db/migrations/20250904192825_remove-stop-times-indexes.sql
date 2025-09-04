-- migrate:up

DROP INDEX IF EXISTS idx_stop_times_trip_stop;
DROP INDEX IF EXISTS idx_stop_times_trip_id;

-- migrate:down

CREATE INDEX idx_stop_times_trip_stop
ON stop_times (feed_code, trip_id, stop_id);

CREATE INDEX idx_stop_times_trip_id
ON stop_times (feed_code, trip_id);
