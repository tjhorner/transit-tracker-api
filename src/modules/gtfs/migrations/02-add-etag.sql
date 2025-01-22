ALTER TABLE import_metadata ADD COLUMN etag TEXT;
ALTER TABLE import_metadata ALTER COLUMN last_modified DROP NOT NULL;
ALTER TABLE import_metadata ADD PRIMARY KEY (feed_code);
