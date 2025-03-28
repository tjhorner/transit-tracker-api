CREATE TABLE import_metadata (
	last_modified timestamp NOT NULL,
	feed_code text NOT NULL
);

CREATE TABLE feed_info (
	feed_code text NOT NULL,
	feed_publisher_name text NULL,
	feed_publisher_url text NULL,
	feed_lang text NULL,
	feed_start_date date NULL,
	feed_end_date date NULL,
	feed_version text NULL
);

CREATE TABLE agency (
	feed_code text NOT NULL,
	agency_id text NOT NULL DEFAULT '1',
	agency_name text NOT NULL,
	agency_url text NOT NULL,
	agency_timezone text NOT NULL,
	agency_lang text NULL,
	agency_phone text NULL,
	agency_fare_url text NULL,
	agency_email text NULL,
	PRIMARY KEY (feed_code, agency_id)
);

CREATE FUNCTION default_agency_id() RETURNS text language SQL AS $$
	SELECT agency_id FROM agency LIMIT 1;
$$;

CREATE TABLE calendar (
	feed_code text NOT NULL,
	service_id text NOT NULL,
	monday int4 NOT NULL,
	tuesday int4 NOT NULL,
	wednesday int4 NOT NULL,
	thursday int4 NOT NULL,
	friday int4 NOT NULL,
	saturday int4 NOT NULL,
	sunday int4 NOT NULL,
	start_date date NOT NULL,
	end_date date NOT NULL,
	PRIMARY KEY (feed_code, service_id)
);

CREATE INDEX idx_calendar_service_date_range
ON calendar (feed_code, start_date, end_date, service_id);

CREATE TABLE calendar_dates (
	feed_code text NOT NULL,
	service_id text NOT NULL,
	date date NOT NULL,
	exception_type int4 NOT NULL,
	PRIMARY KEY (feed_code, service_id, date),
	FOREIGN KEY (feed_code, service_id) REFERENCES calendar (feed_code, service_id)
);

CREATE INDEX idx_calendar_dates_date_exception
ON calendar_dates (feed_code, date, exception_type);

CREATE TABLE routes (
	feed_code text NOT NULL,
	route_id text NOT NULL,
	agency_id text NOT NULL DEFAULT default_agency_id(),
	route_short_name text NULL,
	route_long_name text NULL,
	route_desc text NULL,
	route_type int4 NULL,
	route_url text NULL,
	route_color text NULL,
	route_text_color text NULL,
	route_sort_order int4 NULL,
	continuous_pickup int4 NULL,
	continuous_drop_off int4 NULL,
	network_id text NULL,
	PRIMARY KEY (feed_code, route_id),
	FOREIGN KEY (feed_code, agency_id) REFERENCES agency (feed_code, agency_id)
);

CREATE TABLE stops (
	feed_code text NOT NULL,
	stop_id text NOT NULL,
	stop_code text NULL,
	stop_name text NULL,
	stop_desc text NULL,
	stop_lat float4 NULL,
	stop_lon float4 NULL,
	zone_id text NULL,
	stop_url text NULL,
	location_type int4 NULL,
	parent_station text NULL,
	stop_timezone text NULL,
	wheelchair_boarding int4 NULL,
	PRIMARY KEY (feed_code, stop_id)
);

CREATE TABLE trips (
	feed_code text NOT NULL,
	trip_id text NOT NULL,
	route_id text NULL,
	service_id text NULL,
	trip_headsign text NULL,
	trip_short_name text NULL,
	direction_id int4 NULL,
	block_id text NULL,
	shape_id text NULL,
	peak_flag int4 NULL,
	fare_id text NULL,
	wheelchair_accessible int4 NULL,
	bikes_allowed int4 NULL,
	PRIMARY KEY (feed_code, trip_id),
	FOREIGN KEY (feed_code, route_id) REFERENCES routes (feed_code, route_id),
	FOREIGN KEY (feed_code, service_id) REFERENCES calendar (feed_code, service_id)
);

CREATE INDEX idx_trips_route_service
ON trips (feed_code, route_id, service_id);

CREATE TABLE stop_times (
	feed_code text NOT NULL,
	trip_id text NOT NULL,
	arrival_time text NULL,
	departure_time text NULL,
	stop_id text NOT NULL,
	stop_sequence int4 NOT NULL,
	stop_headsign text NULL,
	pickup_type int4 NULL,
	drop_off_type int4 NULL,
	shape_dist_traveled float4 NULL,
	timepoint int4 NULL,
	PRIMARY KEY (feed_code, trip_id, stop_sequence),
	FOREIGN KEY (feed_code, stop_id) REFERENCES stops (feed_code, stop_id),
	FOREIGN KEY (feed_code, trip_id) REFERENCES trips (feed_code, trip_id)
);

CREATE INDEX idx_stop_times_trip_stop
ON stop_times (feed_code, trip_id, stop_id);

CREATE INDEX idx_stop_times_stop_id
ON stop_times (feed_code, stop_id);

CREATE INDEX idx_stop_times_trip_id
ON stop_times (feed_code, trip_id);

ALTER TABLE import_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_import_metadata
ON import_metadata
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_feed_info
ON feed_info
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_agency
ON agency
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_calendar
ON calendar
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_calendar_dates
ON calendar_dates
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_routes
ON routes
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_stops
ON stops
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_stop_times
ON stop_times
USING (feed_code = current_setting('app.current_feed'));

CREATE POLICY rls_trips
ON trips
USING (feed_code = current_setting('app.current_feed'));

CREATE ROLE gtfs WITH 
	NOSUPERUSER
	NOCREATEDB
	NOCREATEROLE
	NOINHERIT
	LOGIN
	NOREPLICATION
	NOBYPASSRLS
	CONNECTION LIMIT -1;

GRANT USAGE, CREATE ON SCHEMA public TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar_dates TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.feed_info TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.agency TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.import_metadata TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.routes TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stop_times TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stops TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.trips TO gtfs;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLES TO gtfs;