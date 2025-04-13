/* @name UpsertImportMetadata */
INSERT INTO import_metadata (etag, last_modified, feed_code)
VALUES (:etag, :lastModified, :feedCode)
ON CONFLICT (feed_code) 
DO UPDATE SET 
  etag = :etag,
  last_modified = :lastModified;
