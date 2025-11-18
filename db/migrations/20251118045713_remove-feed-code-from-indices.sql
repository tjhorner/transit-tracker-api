-- migrate:up

DROP INDEX IF EXISTS idx_calendar_service_date_range;
DROP INDEX IF EXISTS idx_calendar_dates_date_exception;
DROP INDEX IF EXISTS idx_frequencies_trip_id;
DROP INDEX IF EXISTS idx_stop_times_stop_id;
DROP INDEX IF EXISTS stop_times_null_arrival_time_idx;
DROP INDEX IF EXISTS stop_times_null_departure_time_idx;
DROP INDEX IF EXISTS idx_trips_route_service;

CREATE INDEX idx_calendar_service_date_range ON public.calendar USING btree (start_date, end_date, service_id);
CREATE INDEX idx_calendar_dates_date_exception ON public.calendar_dates USING btree (date, exception_type);
CREATE INDEX idx_frequencies_trip_id ON public.frequencies USING btree (trip_id);
CREATE INDEX idx_stop_times_stop_id ON public.stop_times USING btree (stop_id);
CREATE INDEX stop_times_null_arrival_time_idx ON public.stop_times USING btree (arrival_time) WHERE (arrival_time IS NULL);
CREATE INDEX stop_times_null_departure_time_idx ON public.stop_times USING btree (departure_time) WHERE (departure_time IS NULL);
CREATE INDEX idx_trips_route_service ON public.trips USING btree (route_id, service_id);

-- new index for these columns which is pkey but without feed_code
CREATE INDEX agency_agency_id_idx ON public.agency USING btree (agency_id);
CREATE INDEX calendar_service_id_idx ON public.calendar USING btree (service_id);
CREATE INDEX calendar_dates_service_id_date_idx ON public.calendar_dates USING btree (service_id, date);
CREATE INDEX routes_route_id_idx ON public.routes USING btree (route_id);
CREATE INDEX stops_stop_id_idx ON public.stops USING btree (stop_id);
CREATE INDEX stop_times_trip_id_stop_sequence_idx ON public.stop_times USING btree (trip_id, stop_sequence);
CREATE INDEX trips_trip_id_idx ON public.trips USING btree (trip_id);

-- migrate:down

DROP INDEX IF EXISTS agency_agency_id_idx;
DROP INDEX IF EXISTS calendar_service_id_idx;
DROP INDEX IF EXISTS calendar_dates_service_id_date_idx;
DROP INDEX IF EXISTS routes_route_id_idx;
DROP INDEX IF EXISTS stops_stop_id_idx;
DROP INDEX IF EXISTS stop_times_trip_id_stop_sequence_idx;
DROP INDEX IF EXISTS trips_trip_id_idx;

DROP INDEX IF EXISTS idx_calendar_service_date_range;
DROP INDEX IF EXISTS idx_calendar_dates_date_exception;
DROP INDEX IF EXISTS idx_frequencies_trip_id;
DROP INDEX IF EXISTS idx_stop_times_stop_id;
DROP INDEX IF EXISTS stop_times_null_arrival_time_idx;
DROP INDEX IF EXISTS stop_times_null_departure_time_idx;
DROP INDEX IF EXISTS idx_trips_route_service;

CREATE INDEX idx_calendar_service_date_range ON public.calendar USING btree (feed_code, start_date, end_date, service_id);
CREATE INDEX idx_calendar_dates_date_exception ON public.calendar_dates USING btree (feed_code, date, exception_type);
CREATE INDEX idx_frequencies_trip_id ON public.frequencies USING btree (feed_code, trip_id);
CREATE INDEX idx_stop_times_stop_id ON public.stop_times USING btree (feed_code, stop_id);
CREATE INDEX stop_times_null_arrival_time_idx ON public.stop_times USING btree (feed_code, arrival_time) WHERE (arrival_time IS NULL);
CREATE INDEX stop_times_null_departure_time_idx ON public.stop_times USING btree (feed_code, departure_time) WHERE (departure_time IS NULL);
CREATE INDEX idx_trips_route_service ON public.trips USING btree (feed_code, route_id, service_id);
