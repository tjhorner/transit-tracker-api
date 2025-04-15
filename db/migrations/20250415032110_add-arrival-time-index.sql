-- migrate:up

CREATE INDEX stop_times_arrival_time_idx ON public.stop_times (feed_code, arrival_time);

-- migrate:down

DROP INDEX IF EXISTS public.stop_times_arrival_time_idx;
