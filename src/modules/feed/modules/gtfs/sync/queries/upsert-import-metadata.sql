/* @name UpsertImportMetadata */
INSERT INTO import_metadata (etag, last_modified, feed_code, imported_at)
VALUES (:etag, :lastModified, :feedCode, now())
ON CONFLICT (feed_code) 
DO UPDATE SET 
  etag = :etag,
  last_modified = :lastModified,
  imported_at = now();
