/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/list-schedule-for-route.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

export type DateOrString = Date | string

/** 'GetScheduleForRouteAtStop' parameters type */
export interface IGetScheduleForRouteAtStopParams {
  nowUnixTime: number
  offset: DateOrString
  routeId: string
  stopId: string
}

/** 'GetScheduleForRouteAtStop' return type */
export interface IGetScheduleForRouteAtStopResult {
  arrival_time: Date
  departure_time: Date
  route_color: string | null
  route_id: string
  route_name: string | null
  start_date: string | null
  stop_headsign: string | null
  stop_id: string
  stop_name: string | null
  stop_sequence: number
  trip_id: string
}

/** 'GetScheduleForRouteAtStop' query type */
export interface IGetScheduleForRouteAtStopQuery {
  params: IGetScheduleForRouteAtStopParams
  result: IGetScheduleForRouteAtStopResult
}

const getScheduleForRouteAtStopIR: any = {
  usedParamSet: {
    routeId: true,
    nowUnixTime: true,
    offset: true,
    stopId: true,
  },
  params: [
    {
      name: "routeId",
      required: true,
      transform: { type: "scalar" },
      locs: [
        { a: 147, b: 155 },
        { a: 1839, b: 1847 },
      ],
    },
    {
      name: "nowUnixTime",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 261, b: 273 }],
    },
    {
      name: "offset",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 278, b: 285 }],
    },
    {
      name: "stopId",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 3494, b: 3501 }],
    },
  ],
  statement:
    "WITH agency_timezone AS (\n    SELECT agency_timezone AS tz\n    FROM routes r\n    JOIN agency a ON r.agency_id = a.agency_id\n    WHERE r.route_id = :routeId!\n    LIMIT 1\n),\ncurrent_day AS (\n    SELECT DATE(TIMEZONE((SELECT tz FROM agency_timezone), to_timestamp(:nowUnixTime!) + :offset!::interval)) AS today\n),\nactive_services AS (\n    -- Services active according to the calendar table\n    SELECT service_id\n    FROM calendar, current_day\n    WHERE today BETWEEN start_date AND end_date\n      AND CASE\n          WHEN EXTRACT(DOW FROM today) = 0 THEN sunday\n          WHEN EXTRACT(DOW FROM today) = 1 THEN monday\n          WHEN EXTRACT(DOW FROM today) = 2 THEN tuesday\n          WHEN EXTRACT(DOW FROM today) = 3 THEN wednesday\n          WHEN EXTRACT(DOW FROM today) = 4 THEN thursday\n          WHEN EXTRACT(DOW FROM today) = 5 THEN friday\n          WHEN EXTRACT(DOW FROM today) = 6 THEN saturday\n          END = 1\n),\noverride_services AS (\n    -- Services added on specific dates\n    SELECT service_id\n    FROM calendar_dates, current_day\n    WHERE date = today\n      AND exception_type = 1\n),\nremoved_services AS (\n    -- Services removed on specific dates\n    SELECT service_id\n    FROM calendar_dates, current_day\n    WHERE date = today\n      AND exception_type = 2\n),\nfinal_active_services AS (\n    -- Combine active services, accounting for overrides\n    SELECT DISTINCT service_id\n    FROM active_services\n    UNION\n    SELECT service_id\n    FROM override_services\n    EXCEPT\n    SELECT service_id\n    FROM removed_services\n),\nroute_trips AS (\n    -- Fetch trips for the specific route and active services\n    SELECT t.trip_id, t.trip_headsign, r.route_short_name, r.route_long_name, r.route_id\n    FROM trips t\n    JOIN routes r ON t.route_id = r.route_id\n    LEFT JOIN frequencies f ON t.trip_id = f.trip_id\n    WHERE t.route_id = :routeId!\n      AND t.service_id IN (SELECT service_id FROM final_active_services)\n      AND f.trip_id IS NULL -- TODO: support frequencies.txt\n),\nlast_stops AS (\n    SELECT \n        st.trip_id,\n        st.stop_id AS last_stop_id,\n        s.stop_name AS last_stop_name\n    FROM stop_times st\n    JOIN stops s ON st.stop_id = s.stop_id\n    WHERE st.stop_sequence = (\n        SELECT MAX(st2.stop_sequence)\n        FROM stop_times st2\n        WHERE st2.trip_id = st.trip_id\n    )\n)\n-- Fetch stop_times with stop_timezone and route_short_name\nSELECT \n    st.trip_id,\n    st.stop_id,\n    st.stop_sequence,\n    rt.route_id,\n    CASE\n        WHEN coalesce(TRIM(rt.route_short_name), '') = '' THEN rt.route_long_name\n        ELSE rt.route_short_name\n    END AS route_name,\n    r.route_color,\n    s.stop_name,\n    CASE\n        WHEN coalesce(TRIM(st.stop_headsign), '') = '' THEN\n            CASE\n                WHEN coalesce(TRIM(rt.trip_headsign), '') = '' THEN ls.last_stop_name\n                ELSE rt.trip_headsign\n            END\n        ELSE\n            st.stop_headsign\n    END AS stop_headsign,\n    TIMEZONE(agency_timezone.tz, current_day.today + st.arrival_time::interval) as \"arrival_time!\",\n    TIMEZONE(agency_timezone.tz, current_day.today + st.departure_time::interval) as \"departure_time!\",\n    to_char(current_day.today + st.arrival_time::interval, 'YYYYMMDD') as start_date\nFROM stop_times st\nJOIN route_trips rt ON st.trip_id = rt.trip_id\nJOIN routes r ON rt.route_id = r.route_id\nJOIN stops s ON st.stop_id = s.stop_id\nJOIN current_day ON true\nJOIN agency_timezone ON true\nLEFT JOIN last_stops ls ON st.trip_id = ls.trip_id\nWHERE st.stop_id = :stopId!\nAND st.arrival_time IS NOT NULL\nAND st.departure_time IS NOT NULL\nORDER BY st.arrival_time",
}

/**
 * Query generated from SQL:
 * ```
 * WITH agency_timezone AS (
 *     SELECT agency_timezone AS tz
 *     FROM routes r
 *     JOIN agency a ON r.agency_id = a.agency_id
 *     WHERE r.route_id = :routeId!
 *     LIMIT 1
 * ),
 * current_day AS (
 *     SELECT DATE(TIMEZONE((SELECT tz FROM agency_timezone), to_timestamp(:nowUnixTime!) + :offset!::interval)) AS today
 * ),
 * active_services AS (
 *     -- Services active according to the calendar table
 *     SELECT service_id
 *     FROM calendar, current_day
 *     WHERE today BETWEEN start_date AND end_date
 *       AND CASE
 *           WHEN EXTRACT(DOW FROM today) = 0 THEN sunday
 *           WHEN EXTRACT(DOW FROM today) = 1 THEN monday
 *           WHEN EXTRACT(DOW FROM today) = 2 THEN tuesday
 *           WHEN EXTRACT(DOW FROM today) = 3 THEN wednesday
 *           WHEN EXTRACT(DOW FROM today) = 4 THEN thursday
 *           WHEN EXTRACT(DOW FROM today) = 5 THEN friday
 *           WHEN EXTRACT(DOW FROM today) = 6 THEN saturday
 *           END = 1
 * ),
 * override_services AS (
 *     -- Services added on specific dates
 *     SELECT service_id
 *     FROM calendar_dates, current_day
 *     WHERE date = today
 *       AND exception_type = 1
 * ),
 * removed_services AS (
 *     -- Services removed on specific dates
 *     SELECT service_id
 *     FROM calendar_dates, current_day
 *     WHERE date = today
 *       AND exception_type = 2
 * ),
 * final_active_services AS (
 *     -- Combine active services, accounting for overrides
 *     SELECT DISTINCT service_id
 *     FROM active_services
 *     UNION
 *     SELECT service_id
 *     FROM override_services
 *     EXCEPT
 *     SELECT service_id
 *     FROM removed_services
 * ),
 * route_trips AS (
 *     -- Fetch trips for the specific route and active services
 *     SELECT t.trip_id, t.trip_headsign, r.route_short_name, r.route_long_name, r.route_id
 *     FROM trips t
 *     JOIN routes r ON t.route_id = r.route_id
 *     LEFT JOIN frequencies f ON t.trip_id = f.trip_id
 *     WHERE t.route_id = :routeId!
 *       AND t.service_id IN (SELECT service_id FROM final_active_services)
 *       AND f.trip_id IS NULL -- TODO: support frequencies.txt
 * ),
 * last_stops AS (
 *     SELECT
 *         st.trip_id,
 *         st.stop_id AS last_stop_id,
 *         s.stop_name AS last_stop_name
 *     FROM stop_times st
 *     JOIN stops s ON st.stop_id = s.stop_id
 *     WHERE st.stop_sequence = (
 *         SELECT MAX(st2.stop_sequence)
 *         FROM stop_times st2
 *         WHERE st2.trip_id = st.trip_id
 *     )
 * )
 * -- Fetch stop_times with stop_timezone and route_short_name
 * SELECT
 *     st.trip_id,
 *     st.stop_id,
 *     st.stop_sequence,
 *     rt.route_id,
 *     CASE
 *         WHEN coalesce(TRIM(rt.route_short_name), '') = '' THEN rt.route_long_name
 *         ELSE rt.route_short_name
 *     END AS route_name,
 *     r.route_color,
 *     s.stop_name,
 *     CASE
 *         WHEN coalesce(TRIM(st.stop_headsign), '') = '' THEN
 *             CASE
 *                 WHEN coalesce(TRIM(rt.trip_headsign), '') = '' THEN ls.last_stop_name
 *                 ELSE rt.trip_headsign
 *             END
 *         ELSE
 *             st.stop_headsign
 *     END AS stop_headsign,
 *     TIMEZONE(agency_timezone.tz, current_day.today + st.arrival_time::interval) as "arrival_time!",
 *     TIMEZONE(agency_timezone.tz, current_day.today + st.departure_time::interval) as "departure_time!",
 *     to_char(current_day.today + st.arrival_time::interval, 'YYYYMMDD') as start_date
 * FROM stop_times st
 * JOIN route_trips rt ON st.trip_id = rt.trip_id
 * JOIN routes r ON rt.route_id = r.route_id
 * JOIN stops s ON st.stop_id = s.stop_id
 * JOIN current_day ON true
 * JOIN agency_timezone ON true
 * LEFT JOIN last_stops ls ON st.trip_id = ls.trip_id
 * WHERE st.stop_id = :stopId!
 * AND st.arrival_time IS NOT NULL
 * AND st.departure_time IS NOT NULL
 * ORDER BY st.arrival_time
 * ```
 */
export const getScheduleForRouteAtStop = new PreparedQuery<
  IGetScheduleForRouteAtStopParams,
  IGetScheduleForRouteAtStopResult
>(getScheduleForRouteAtStopIR)
