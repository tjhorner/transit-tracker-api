/* @name ListRoutesForStop */
SELECT
  routes.route_id,
  routes.route_short_name,
  routes.route_long_name,
  routes.route_color,
  JSON_AGG(DISTINCT CASE 
    WHEN coalesce(TRIM(stop_times.stop_headsign), '') = '' THEN trips.trip_headsign
    ELSE stop_times.stop_headsign
  END) AS headsigns
FROM stop_times
INNER JOIN trips ON stop_times.trip_id = trips.trip_id
INNER JOIN routes ON trips.route_id = routes.route_id
WHERE stop_times.stop_id = :stopId!
GROUP BY
  routes.route_id,
  routes.route_short_name,
  routes.route_long_name,
  routes.route_color
ORDER BY routes.route_short_name;
