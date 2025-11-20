/* @name UpsertImportMetadata */
INSERT INTO "import_metadata" (etag, last_modified, hash, feed_code, imported_at)
VALUES (:etag, :lastModified, :hash, :feedCode, now())
ON CONFLICT (feed_code) 
DO UPDATE SET
  etag = :etag,
  last_modified = :lastModified,
  hash = :hash,
  imported_at = now();
