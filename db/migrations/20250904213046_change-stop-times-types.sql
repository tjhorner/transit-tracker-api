-- migrate:up

ALTER TABLE stop_times
ALTER COLUMN timepoint TYPE boolean USING timepoint::boolean,
ALTER COLUMN pickup_type TYPE smallint USING pickup_type::smallint,
ALTER COLUMN drop_off_type TYPE smallint USING pickup_type::smallint,
ALTER COLUMN stop_sequence TYPE smallint USING stop_sequence::smallint;

-- migrate:down

ALTER TABLE stop_times
ALTER COLUMN timepoint TYPE int4 USING timepoint::int4,
ALTER COLUMN pickup_type TYPE int4 USING pickup_type::int4,
ALTER COLUMN drop_off_type TYPE int4 USING drop_off_type::int4,
ALTER COLUMN stop_sequence TYPE int4 USING stop_sequence::int4;
