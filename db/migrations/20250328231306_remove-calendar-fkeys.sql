-- migrate:up

ALTER TABLE calendar_dates DROP CONSTRAINT calendar_dates_feed_code_service_id_fkey;
ALTER TABLE trips DROP CONSTRAINT trips_feed_code_service_id_fkey;

-- migrate:down

ALTER TABLE trips ADD CONSTRAINT trips_feed_code_service_id_fkey
  FOREIGN KEY (feed_code, service_id) REFERENCES calendar(feed_code, service_id);
  
ALTER TABLE calendar_dates ADD CONSTRAINT calendar_dates_feed_code_service_id_fkey
  FOREIGN KEY (feed_code, service_id) REFERENCES calendar(feed_code, service_id);
