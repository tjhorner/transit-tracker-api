/* @name GetStop */
SELECT
  stop_id,
  stop_name,
  stop_code,
  stop_lat,
  stop_lon
FROM
  "stops"
WHERE
  stop_id = :stopId!
LIMIT 1;