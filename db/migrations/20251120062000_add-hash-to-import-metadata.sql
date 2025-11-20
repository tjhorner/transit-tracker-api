-- migrate:up

ALTER TABLE import_metadata ADD COLUMN hash TEXT;

-- migrate:down

ALTER TABLE import_metadata DROP COLUMN hash;
