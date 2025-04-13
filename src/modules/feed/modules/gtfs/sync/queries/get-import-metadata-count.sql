/* @name GetImportMetadataCount */
SELECT
  COUNT(feed_code)::int AS "count!"
FROM
  import_metadata;
