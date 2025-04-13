-- migrate:up

CREATE TABLE frequencies (
  feed_code text NOT NULL,
  trip_id text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  headway_secs int4 NOT NULL,
  exact_times int4 NULL,
  PRIMARY KEY (feed_code, trip_id, start_time),
  FOREIGN KEY (feed_code, trip_id) REFERENCES trips (feed_code, trip_id)
);

CREATE INDEX idx_frequencies_trip_id
ON frequencies (feed_code, trip_id);

-- migrate:down

DROP INDEX idx_frequencies_trip_id;
DROP TABLE frequencies;
