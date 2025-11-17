/* @name GetImportMetadata */
SELECT
  last_modified,
  etag,
  imported_at
FROM
  import_metadata
WHERE
  feed_code = :feedCode!;