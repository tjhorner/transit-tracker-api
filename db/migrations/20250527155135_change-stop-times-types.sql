-- migrate:up

ALTER TABLE public.stop_times
ALTER COLUMN arrival_time TYPE INTERVAL HOUR TO SECOND USING arrival_time::interval,
ALTER COLUMN departure_time TYPE INTERVAL HOUR TO SECOND USING departure_time::interval,
ALTER COLUMN shape_dist_traveled TYPE REAL;

-- migrate:down

ALTER TABLE public.stop_times

ALTER COLUMN arrival_time TYPE TEXT USING (
  to_char(arrival_time, 'HH24:MI:SS')
),

ALTER COLUMN departure_time TYPE TEXT USING (
  to_char(departure_time, 'HH24:MI:SS')
)

ALTER COLUMN shape_dist_traveled TYPE float4;
