/* @name ListStopsInArea */
SELECT 
  stop_id, 
  stop_name, 
  stop_code, 
  stop_lat, 
  stop_lon
FROM 
  stops
WHERE 
  stop_lat IS NOT NULL
  AND stop_lon IS NOT NULL
  AND stop_lat BETWEEN :minLat AND :maxLat
  AND stop_lon BETWEEN :minLon AND :maxLon;