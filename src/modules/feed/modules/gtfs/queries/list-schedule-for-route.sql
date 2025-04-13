/* @name GetScheduleForRouteAtStop */
WITH agency_timezone AS (
    SELECT agency_timezone AS tz
    FROM routes r
    JOIN agency a ON r.agency_id = a.agency_id
    WHERE r.route_id = :routeId!
    LIMIT 1
),
current_day AS (
    SELECT DATE(TIMEZONE((SELECT tz FROM agency_timezone), to_timestamp(:nowUnixTime!) + :offset!::interval)) AS today
),
active_services AS (
    -- Services active according to the calendar table
    SELECT service_id
    FROM calendar, current_day
    WHERE today BETWEEN start_date AND end_date
      AND CASE
          WHEN EXTRACT(DOW FROM today) = 0 THEN sunday
          WHEN EXTRACT(DOW FROM today) = 1 THEN monday
          WHEN EXTRACT(DOW FROM today) = 2 THEN tuesday
          WHEN EXTRACT(DOW FROM today) = 3 THEN wednesday
          WHEN EXTRACT(DOW FROM today) = 4 THEN thursday
          WHEN EXTRACT(DOW FROM today) = 5 THEN friday
          WHEN EXTRACT(DOW FROM today) = 6 THEN saturday
          END = 1
),
override_services AS (
    -- Services added on specific dates
    SELECT service_id
    FROM calendar_dates, current_day
    WHERE date = today
      AND exception_type = 1
),
removed_services AS (
    -- Services removed on specific dates
    SELECT service_id
    FROM calendar_dates, current_day
    WHERE date = today
      AND exception_type = 2
),
final_active_services AS (
    -- Combine active services, accounting for overrides
    SELECT DISTINCT service_id
    FROM active_services
    UNION
    SELECT service_id
    FROM override_services
    EXCEPT
    SELECT service_id
    FROM removed_services
),
route_trips AS (
    -- Fetch trips for the specific route and active services
    SELECT t.trip_id, t.trip_headsign, r.route_short_name, r.route_long_name, r.route_id
    FROM trips t
    JOIN routes r ON t.route_id = r.route_id
    LEFT JOIN frequencies f ON t.trip_id = f.trip_id
    WHERE t.route_id = :routeId!
      AND t.service_id IN (SELECT service_id FROM final_active_services)
      AND f.trip_id IS NULL -- TODO: support frequencies.txt
),
last_stops AS (
    SELECT 
        st.trip_id,
        st.stop_id AS last_stop_id,
        s.stop_name AS last_stop_name
    FROM stop_times st
    JOIN stops s ON st.stop_id = s.stop_id
    WHERE st.stop_sequence = (
        SELECT MAX(st2.stop_sequence)
        FROM stop_times st2
        WHERE st2.trip_id = st.trip_id
    )
)
-- Fetch stop_times with stop_timezone and route_short_name
SELECT 
    st.trip_id,
    st.stop_id,
    st.stop_sequence,
    rt.route_id,
    CASE
        WHEN coalesce(TRIM(rt.route_short_name), '') = '' THEN rt.route_long_name
        ELSE rt.route_short_name
    END AS route_name,
    r.route_color,
    s.stop_name,
    CASE
        WHEN coalesce(TRIM(st.stop_headsign), '') = '' THEN
            CASE
                WHEN coalesce(TRIM(rt.trip_headsign), '') = '' THEN ls.last_stop_name
                ELSE rt.trip_headsign
            END
        ELSE
            st.stop_headsign
    END AS stop_headsign,
    TIMEZONE(agency_timezone.tz, current_day.today + st.arrival_time::interval) as "arrival_time!",
    TIMEZONE(agency_timezone.tz, current_day.today + st.departure_time::interval) as "departure_time!",
    to_char(current_day.today + st.arrival_time::interval, 'YYYYMMDD') as start_date
FROM stop_times st
JOIN route_trips rt ON st.trip_id = rt.trip_id
JOIN routes r ON rt.route_id = r.route_id
JOIN stops s ON st.stop_id = s.stop_id
JOIN current_day ON true
JOIN agency_timezone ON true
LEFT JOIN last_stops ls ON st.trip_id = ls.trip_id
WHERE st.stop_id = :stopId!
AND st.arrival_time IS NOT NULL
AND st.departure_time IS NOT NULL
ORDER BY st.arrival_time;
