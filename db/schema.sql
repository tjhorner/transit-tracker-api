\restrict dbmate

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: default_agency_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.default_agency_id() RETURNS text
    LANGUAGE sql
    AS $$
  SELECT agency_id FROM agency LIMIT 1;
$$;


SET default_tablespace = '';

--
-- Name: agency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency (
    feed_code text NOT NULL,
    agency_id text DEFAULT '1'::text NOT NULL,
    agency_name text NOT NULL,
    agency_url text NOT NULL,
    agency_timezone text NOT NULL,
    agency_lang text,
    agency_phone text,
    agency_fare_url text,
    agency_email text
)
PARTITION BY LIST (feed_code);


--
-- Name: calendar; Type: TABLE; Schema: public; Owner: -
--

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
    end_date date NOT NULL
)
PARTITION BY LIST (feed_code);


--
-- Name: calendar_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_dates (
    feed_code text NOT NULL,
    service_id text NOT NULL,
    date date NOT NULL,
    exception_type integer NOT NULL
)
PARTITION BY LIST (feed_code);


--
-- Name: feed_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_info (
    feed_code text NOT NULL,
    feed_publisher_name text,
    feed_publisher_url text,
    feed_lang text,
    feed_start_date date,
    feed_end_date date,
    feed_version text
)
PARTITION BY LIST (feed_code);


--
-- Name: frequencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.frequencies (
    feed_code text NOT NULL,
    trip_id text NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    headway_secs integer NOT NULL,
    exact_times integer
)
PARTITION BY LIST (feed_code);


SET default_table_access_method = heap;

--
-- Name: import_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_metadata (
    last_modified timestamp without time zone,
    feed_code text NOT NULL,
    etag text,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    hash text
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    feed_code text NOT NULL,
    route_id text NOT NULL,
    agency_id text DEFAULT public.default_agency_id() NOT NULL,
    route_short_name text,
    route_long_name text,
    route_color text
)
PARTITION BY LIST (feed_code);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: stop_times; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stop_times (
    feed_code text NOT NULL,
    trip_id text NOT NULL,
    arrival_time interval hour to second,
    departure_time interval hour to second,
    stop_id text NOT NULL,
    stop_sequence smallint NOT NULL,
    stop_headsign text,
    shape_dist_traveled real
)
PARTITION BY LIST (feed_code);


--
-- Name: stops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stops (
    feed_code text NOT NULL,
    stop_id text NOT NULL,
    stop_code text,
    stop_name text,
    stop_lat real,
    stop_lon real
)
PARTITION BY LIST (feed_code);


--
-- Name: sync_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_lock (
    feed_code text NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    feed_code text NOT NULL,
    trip_id text NOT NULL,
    route_id text,
    service_id text,
    trip_headsign text,
    direction_id integer
)
PARTITION BY LIST (feed_code);


--
-- Name: agency agency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency
    ADD CONSTRAINT agency_pkey PRIMARY KEY (feed_code, agency_id);


--
-- Name: calendar_dates calendar_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_dates
    ADD CONSTRAINT calendar_dates_pkey PRIMARY KEY (feed_code, service_id, date);


--
-- Name: calendar calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar
    ADD CONSTRAINT calendar_pkey PRIMARY KEY (feed_code, service_id);


--
-- Name: frequencies frequencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.frequencies
    ADD CONSTRAINT frequencies_pkey PRIMARY KEY (feed_code, trip_id, start_time);


--
-- Name: import_metadata import_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_metadata
    ADD CONSTRAINT import_metadata_pkey PRIMARY KEY (feed_code);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (feed_code, route_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: stop_times stop_times_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stop_times
    ADD CONSTRAINT stop_times_pkey PRIMARY KEY (feed_code, trip_id, stop_sequence);


--
-- Name: stops stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stops
    ADD CONSTRAINT stops_pkey PRIMARY KEY (feed_code, stop_id);


--
-- Name: sync_lock sync_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_lock
    ADD CONSTRAINT sync_lock_pkey PRIMARY KEY (feed_code);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (feed_code, trip_id);


--
-- Name: agency_agency_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agency_agency_id_idx ON ONLY public.agency USING btree (agency_id);


--
-- Name: idx_calendar_dates_date_exception; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_dates_date_exception ON ONLY public.calendar_dates USING btree (date, exception_type);


--
-- Name: idx_calendar_service_date_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_service_date_range ON ONLY public.calendar USING btree (start_date, end_date, service_id);


--
-- Name: idx_frequencies_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_frequencies_trip_id ON ONLY public.frequencies USING btree (trip_id);


--
-- Name: idx_stop_times_stop_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stop_times_stop_id ON ONLY public.stop_times USING btree (stop_id);


--
-- Name: idx_trips_route_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_route_service ON ONLY public.trips USING btree (route_id, service_id);


--
-- Name: routes_route_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routes_route_id_idx ON ONLY public.routes USING btree (route_id);


--
-- Name: stop_times_null_arrival_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stop_times_null_arrival_time_idx ON ONLY public.stop_times USING btree (arrival_time) WHERE (arrival_time IS NULL);


--
-- Name: stop_times_null_departure_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stop_times_null_departure_time_idx ON ONLY public.stop_times USING btree (departure_time) WHERE (departure_time IS NULL);


--
-- Name: stops_stop_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stops_stop_id_idx ON ONLY public.stops USING btree (stop_id);


--
-- Name: trips_trip_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trips_trip_id_idx ON ONLY public.trips USING btree (trip_id);


--
-- Name: agency rls_agency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_agency ON public.agency USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: calendar rls_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_calendar ON public.calendar USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: calendar_dates rls_calendar_dates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_calendar_dates ON public.calendar_dates USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: feed_info rls_feed_info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_feed_info ON public.feed_info USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: frequencies rls_frequencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_frequencies ON public.frequencies USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: import_metadata rls_import_metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_import_metadata ON public.import_metadata USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: routes rls_routes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_routes ON public.routes USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: stop_times rls_stop_times; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_stop_times ON public.stop_times USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: stops rls_stops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_stops ON public.stops USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- Name: trips rls_trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_trips ON public.trips USING ((feed_code = current_setting('app.current_feed'::text)));


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20251016032731'),
    ('20251017224354'),
    ('20251027221833'),
    ('20251118045713'),
    ('20251120062000'),
    ('20260331100000'),
    ('20260331100001');
