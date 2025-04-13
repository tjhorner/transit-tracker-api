-- migrate:up

ALTER TABLE import_metadata ADD COLUMN imported_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;

-- migrate:down

ALTER TABLE import_metadata DROP COLUMN imported_at;
