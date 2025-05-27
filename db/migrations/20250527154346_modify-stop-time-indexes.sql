-- migrate:up

DROP INDEX IF EXISTS public.stop_times_arrival_time_idx;

CREATE INDEX stop_times_null_arrival_time_idx ON public.stop_times (feed_code, arrival_time) WHERE arrival_time IS NULL;
CREATE INDEX stop_times_null_departure_time_idx ON public.stop_times (feed_code, departure_time) WHERE departure_time IS NULL;

-- migrate:down

DROP INDEX IF EXISTS public.stop_times_null_arrival_time_idx;
DROP INDEX IF EXISTS public.stop_times_null_departure_time_idx;

CREATE INDEX stop_times_arrival_time_idx ON public.stop_times (feed_code, arrival_time);
