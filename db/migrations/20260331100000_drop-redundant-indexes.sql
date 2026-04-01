-- migrate:up

-- These idx_*_feed_code indexes are redundant: feed_code is already the
-- leading column; of every primary key, and queries go directly to partition
-- tables where feed_code is a constant.
DROP INDEX IF EXISTS idx_stop_times_feed_code;
DROP INDEX IF EXISTS idx_trips_feed_code;
DROP INDEX IF EXISTS idx_stops_feed_code;
DROP INDEX IF EXISTS idx_routes_feed_code;
DROP INDEX IF EXISTS idx_calendar_feed_code;
DROP INDEX IF EXISTS idx_calendar_dates_feed_code;
DROP INDEX IF EXISTS idx_agency_feed_code;
DROP INDEX IF EXISTS idx_feed_info_feed_code;
DROP INDEX IF EXISTS idx_import_metadata_feed_code;

-- Within a partition, the PK (feed_code, trip_id, stop_sequence) already
-- covers (trip_id, stop_sequence) lookups since feed_code is constant.
DROP INDEX IF EXISTS stop_times_trip_id_stop_sequence_idx;

-- Same reasoning: PK (feed_code, service_id, date) covers (service_id, date)
-- within a partition.
DROP INDEX IF EXISTS calendar_dates_service_id_date_idx;

-- PK (feed_code, service_id) covers (service_id) within a partition.
DROP INDEX IF EXISTS calendar_service_id_idx;

-- migrate:down

CREATE INDEX idx_stop_times_feed_code ON ONLY public.stop_times USING btree (feed_code);
CREATE INDEX idx_trips_feed_code ON ONLY public.trips USING btree (feed_code);
CREATE INDEX idx_stops_feed_code ON ONLY public.stops USING btree (feed_code);
CREATE INDEX idx_routes_feed_code ON ONLY public.routes USING btree (feed_code);
CREATE INDEX idx_calendar_feed_code ON ONLY public.calendar USING btree (feed_code);
CREATE INDEX idx_calendar_dates_feed_code ON ONLY public.calendar_dates USING btree (feed_code);
CREATE INDEX idx_agency_feed_code ON ONLY public.agency USING btree (feed_code);
CREATE INDEX idx_feed_info_feed_code ON ONLY public.feed_info USING btree (feed_code);
CREATE INDEX idx_import_metadata_feed_code ON public.import_metadata USING btree (feed_code);
CREATE INDEX stop_times_trip_id_stop_sequence_idx ON ONLY public.stop_times USING btree (trip_id, stop_sequence);
CREATE INDEX calendar_dates_service_id_date_idx ON ONLY public.calendar_dates USING btree (service_id, date);
CREATE INDEX calendar_service_id_idx ON ONLY public.calendar USING btree (service_id);
