/* @name GetFeedInfo */
SELECT
  feed_publisher_name,
  feed_publisher_url,
  feed_lang,
  feed_start_date,
  feed_end_date,
  feed_version
FROM "feed_info"
LIMIT 1;