-- migrate:up

ALTER TABLE import_metadata ADD COLUMN max_stop_time INTERVAL;

-- migrate:down

ALTER TABLE import_metadata DROP COLUMN max_stop_time;
