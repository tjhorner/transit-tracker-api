-- migrate:up

ALTER TABLE import_metadata ADD COLUMN etag TEXT;
ALTER TABLE import_metadata ALTER COLUMN last_modified DROP NOT NULL;
ALTER TABLE import_metadata ADD PRIMARY KEY (feed_code);

-- migrate:down

ALTER TABLE import_metadata DROP COLUMN etag;
ALTER TABLE import_metadata ALTER COLUMN last_modified SET NOT NULL;
ALTER TABLE import_metadata DROP CONSTRAINT import_metadata_pkey;
