-- migrate:up

CREATE INDEX idx_import_metadata_feed_code ON public.import_metadata (feed_code);
CREATE INDEX idx_feed_info_feed_code ON public.feed_info (feed_code);
CREATE INDEX idx_agency_feed_code ON public.agency (feed_code);
CREATE INDEX idx_calendar_feed_code ON public.calendar (feed_code);
CREATE INDEX idx_calendar_dates_feed_code ON public.calendar_dates (feed_code);
CREATE INDEX idx_routes_feed_code ON public.routes (feed_code);
CREATE INDEX idx_stops_feed_code ON public.stops (feed_code);
CREATE INDEX idx_stop_times_feed_code ON public.stop_times (feed_code);
CREATE INDEX idx_trips_feed_code ON public.trips (feed_code);

-- migrate:down

DROP INDEX IF EXISTS public.idx_import_metadata_feed_code;
DROP INDEX IF EXISTS public.idx_feed_info_feed_code;
DROP INDEX IF EXISTS public.idx_agency_feed_code;
DROP INDEX IF EXISTS public.idx_calendar_feed_code;
DROP INDEX IF EXISTS public.idx_calendar_dates_feed_code;
DROP INDEX IF EXISTS public.idx_routes_feed_code;
DROP INDEX IF EXISTS public.idx_stops_feed_code;
DROP INDEX IF EXISTS public.idx_stop_times_feed_code;
DROP INDEX IF EXISTS public.idx_trips_feed_code;
