/* @name GetStopBounds */
SELECT
  MIN(stop_lat) AS min_lat,
  MIN(stop_lon) AS min_lon,
  MAX(stop_lat) AS max_lat,
  MAX(stop_lon) AS max_lon
FROM
  stops;