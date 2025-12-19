/* @name ListStopsInArea */
SELECT 
  stop_id, 
  stop_name, 
  stop_code, 
  stop_lat, 
  stop_lon
FROM 
  "stops" stops
WHERE
  EXISTS (
    -- filter by stops that are actually serviced by any trip
    SELECT 1 FROM "stop_times" st
    WHERE st.stop_id = stops.stop_id
  )
  AND stop_lat IS NOT NULL
  AND stop_lon IS NOT NULL
  AND stop_lat BETWEEN :minLat AND :maxLat
  AND stop_lon BETWEEN :minLon AND :maxLon;