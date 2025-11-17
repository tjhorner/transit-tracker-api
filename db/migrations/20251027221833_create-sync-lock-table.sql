-- migrate:up

CREATE TABLE IF NOT EXISTS sync_lock (
  feed_code TEXT NOT NULL PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrate:down

DROP TABLE IF EXISTS sync_lock;
