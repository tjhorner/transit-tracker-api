/* @name GetImportMetadata */
SELECT
  last_modified,
  etag,
  hash,
  imported_at,
  EXTRACT(EPOCH FROM max_stop_time)::int AS max_stop_time_seconds
FROM
  import_metadata
WHERE
  feed_code = :feedCode!;