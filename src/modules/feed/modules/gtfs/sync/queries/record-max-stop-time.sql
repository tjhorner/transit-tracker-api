/* @name RecordMaxStopTime */
UPDATE import_metadata
SET max_stop_time = (
  SELECT MAX(GREATEST(arrival_time, departure_time))
  FROM "stop_times"
)
WHERE feed_code = :feedCode!;
