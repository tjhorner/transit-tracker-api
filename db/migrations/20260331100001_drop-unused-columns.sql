-- migrate:up

-- Drop columns that are imported but never queried.
-- stop_times is ~80% of the DB, so these matter most.
ALTER TABLE stop_times DROP COLUMN IF EXISTS pickup_type;
ALTER TABLE stop_times DROP COLUMN IF EXISTS drop_off_type;
ALTER TABLE stop_times DROP COLUMN IF EXISTS timepoint;

ALTER TABLE trips DROP COLUMN IF EXISTS trip_short_name;
ALTER TABLE trips DROP COLUMN IF EXISTS block_id;
ALTER TABLE trips DROP COLUMN IF EXISTS shape_id;
ALTER TABLE trips DROP COLUMN IF EXISTS wheelchair_accessible;
ALTER TABLE trips DROP COLUMN IF EXISTS bikes_allowed;
-- These two were never even imported, just defined in the schema:
ALTER TABLE trips DROP COLUMN IF EXISTS peak_flag;
ALTER TABLE trips DROP COLUMN IF EXISTS fare_id;

ALTER TABLE stops DROP COLUMN IF EXISTS stop_desc;
ALTER TABLE stops DROP COLUMN IF EXISTS zone_id;
ALTER TABLE stops DROP COLUMN IF EXISTS stop_url;
ALTER TABLE stops DROP COLUMN IF EXISTS location_type;
ALTER TABLE stops DROP COLUMN IF EXISTS parent_station;
ALTER TABLE stops DROP COLUMN IF EXISTS stop_timezone;
ALTER TABLE stops DROP COLUMN IF EXISTS wheelchair_boarding;

ALTER TABLE routes DROP COLUMN IF EXISTS route_desc;
ALTER TABLE routes DROP COLUMN IF EXISTS route_type;
ALTER TABLE routes DROP COLUMN IF EXISTS route_url;
ALTER TABLE routes DROP COLUMN IF EXISTS route_text_color;
-- These were never imported:
ALTER TABLE routes DROP COLUMN IF EXISTS route_sort_order;
ALTER TABLE routes DROP COLUMN IF EXISTS continuous_pickup;
ALTER TABLE routes DROP COLUMN IF EXISTS continuous_drop_off;
ALTER TABLE routes DROP COLUMN IF EXISTS network_id;

-- migrate:down

ALTER TABLE stop_times ADD COLUMN IF NOT EXISTS pickup_type smallint;
ALTER TABLE stop_times ADD COLUMN IF NOT EXISTS drop_off_type smallint;
ALTER TABLE stop_times ADD COLUMN IF NOT EXISTS timepoint boolean;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_short_name text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS block_id text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS shape_id text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS wheelchair_accessible int;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS bikes_allowed int;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS peak_flag int;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS fare_id text;

ALTER TABLE stops ADD COLUMN IF NOT EXISTS stop_desc text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS zone_id text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS stop_url text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS location_type int;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS parent_station text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS stop_timezone text;
ALTER TABLE stops ADD COLUMN IF NOT EXISTS wheelchair_boarding int;

ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_desc text;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_type int;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_url text;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_text_color text;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_sort_order int;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS continuous_pickup int;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS continuous_drop_off int;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS network_id text;
