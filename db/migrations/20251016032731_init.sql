-- migrate:up

CREATE TABLE public.import_metadata (
  last_modified timestamp without time zone,
  feed_code text NOT NULL PRIMARY KEY,
  etag text,
  imported_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_import_metadata_feed_code ON public.import_metadata USING btree (feed_code);

CREATE TABLE public.agency (
  feed_code text NOT NULL,
  agency_id text DEFAULT '1'::text NOT NULL,
  agency_name text NOT NULL,
  agency_url text NOT NULL,
  agency_timezone text NOT NULL,
  agency_lang text,
  agency_phone text,
  agency_fare_url text,
  agency_email text,
  PRIMARY KEY (feed_code, agency_id)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_agency_feed_code ON public.agency USING btree (feed_code);

CREATE FUNCTION public.default_agency_id() RETURNS text
  LANGUAGE sql
  AS $$
  SELECT agency_id FROM agency LIMIT 1;
$$;

CREATE TABLE public.calendar (
  feed_code text NOT NULL,
  service_id text NOT NULL,
  monday integer NOT NULL,
  tuesday integer NOT NULL,
  wednesday integer NOT NULL,
  thursday integer NOT NULL,
  friday integer NOT NULL,
  saturday integer NOT NULL,
  sunday integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  PRIMARY KEY (feed_code, service_id)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_calendar_feed_code ON public.calendar USING btree (feed_code);
CREATE INDEX idx_calendar_service_date_range ON public.calendar USING btree (feed_code, start_date, end_date, service_id);

CREATE TABLE public.calendar_dates (
  feed_code text NOT NULL,
  service_id text NOT NULL,
  date date NOT NULL,
  exception_type integer NOT NULL,
  PRIMARY KEY (feed_code, service_id, date)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_calendar_dates_feed_code ON public.calendar_dates USING btree (feed_code);
CREATE INDEX idx_calendar_dates_date_exception ON public.calendar_dates USING btree (feed_code, date, exception_type);

CREATE TABLE public.feed_info (
  feed_code text NOT NULL,
  feed_publisher_name text,
  feed_publisher_url text,
  feed_lang text,
  feed_start_date date,
  feed_end_date date,
  feed_version text
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_feed_info_feed_code ON public.feed_info USING btree (feed_code);

CREATE TABLE public.frequencies (
  feed_code text NOT NULL,
  trip_id text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  headway_secs integer NOT NULL,
  exact_times integer,
  PRIMARY KEY (feed_code, trip_id, start_time)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_frequencies_trip_id ON public.frequencies USING btree (feed_code, trip_id);

CREATE TABLE public.routes (
  feed_code text NOT NULL,
  route_id text NOT NULL,
  agency_id text DEFAULT public.default_agency_id() NOT NULL,
  route_short_name text,
  route_long_name text,
  route_desc text,
  route_type integer,
  route_url text,
  route_color text,
  route_text_color text,
  route_sort_order integer,
  continuous_pickup integer,
  continuous_drop_off integer,
  network_id text,
  PRIMARY KEY (feed_code, route_id)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_routes_feed_code ON public.routes USING btree (feed_code);

CREATE TABLE public.stop_times (
  feed_code text NOT NULL,
  trip_id text NOT NULL,
  arrival_time interval hour to second,
  departure_time interval hour to second,
  stop_id text NOT NULL,
  stop_sequence smallint NOT NULL,
  stop_headsign text,
  pickup_type smallint,
  drop_off_type smallint,
  shape_dist_traveled real,
  timepoint boolean,
  PRIMARY KEY (feed_code, trip_id, stop_sequence)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_stop_times_feed_code ON public.stop_times USING btree (feed_code);
CREATE INDEX idx_stop_times_stop_id ON public.stop_times USING btree (feed_code, stop_id);
CREATE INDEX stop_times_null_arrival_time_idx ON public.stop_times USING btree (feed_code, arrival_time) WHERE (arrival_time IS NULL);
CREATE INDEX stop_times_null_departure_time_idx ON public.stop_times USING btree (feed_code, departure_time) WHERE (departure_time IS NULL);

CREATE TABLE public.stops (
  feed_code text NOT NULL,
  stop_id text NOT NULL,
  stop_code text,
  stop_name text,
  stop_desc text,
  stop_lat real,
  stop_lon real,
  zone_id text,
  stop_url text,
  location_type integer,
  parent_station text,
  stop_timezone text,
  wheelchair_boarding integer,
  PRIMARY KEY (feed_code, stop_id)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_stops_feed_code ON public.stops USING btree (feed_code);

CREATE TABLE public.trips (
  feed_code text NOT NULL,
  trip_id text NOT NULL,
  route_id text,
  service_id text,
  trip_headsign text,
  trip_short_name text,
  direction_id integer,
  block_id text,
  shape_id text,
  peak_flag integer,
  fare_id text,
  wheelchair_accessible integer,
  bikes_allowed integer,
  PRIMARY KEY (feed_code, trip_id)
) PARTITION BY LIST (feed_code);

CREATE INDEX idx_trips_feed_code ON public.trips USING btree (feed_code);
CREATE INDEX idx_trips_route_service ON public.trips USING btree (feed_code, route_id, service_id);

ALTER TABLE import_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY rls_frequencies
ON frequencies
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
  NOREPLICATION
  NOLOGIN
  CONNECTION LIMIT -1;

GRANT USAGE, CREATE ON SCHEMA public TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar_dates TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.feed_info TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.agency TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.import_metadata TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.routes TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.frequencies TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stop_times TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stops TO gtfs;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.trips TO gtfs;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLES TO gtfs;

CREATE ROLE gtfs_import WITH 
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  BYPASSRLS
  NOLOGIN
  CONNECTION LIMIT -1;

GRANT USAGE, CREATE ON SCHEMA public TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.calendar_dates TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.feed_info TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.agency TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.import_metadata TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.routes TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.frequencies TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stop_times TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.stops TO gtfs_import;
GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLE public.trips TO gtfs_import;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, REFERENCES, TRUNCATE, TRIGGER, UPDATE, SELECT, DELETE ON TABLES TO gtfs_import;

-- migrate:down

REASSIGN OWNED BY gtfs_import TO postgres;
DROP OWNED BY gtfs_import;
DROP ROLE IF EXISTS gtfs_import;

REASSIGN OWNED BY gtfs TO postgres;
DROP OWNED BY gtfs;
DROP ROLE IF EXISTS gtfs;

DROP TABLE IF EXISTS public.trips;
DROP TABLE IF EXISTS public.stops;
DROP TABLE IF EXISTS public.stop_times;
DROP TABLE IF EXISTS public.routes;
DROP TABLE IF EXISTS public.frequencies;
DROP TABLE IF EXISTS public.feed_info;
DROP TABLE IF EXISTS public.calendar_dates;
DROP TABLE IF EXISTS public.calendar;
DROP TABLE IF EXISTS public.agency;
DROP TABLE IF EXISTS public.import_metadata;

DROP FUNCTION IF EXISTS public.default_agency_id();
