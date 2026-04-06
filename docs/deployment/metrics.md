# Custom Metrics

All custom metrics are exported via OpenTelemetry at port 9090. They can be scraped by any compatible collector (e.g. Prometheus).

## GTFS

### `gtfs_table_size_kb`

- **Type:** Observable Gauge
- **Unit:** kilobytes
- **Description:** Size of each GTFS table per feed.
- **Labels:** `feed_code`, `table`

### `gtfs_db_query_count`

- **Type:** Counter
- **Unit:** queries
- **Description:** Total number of GTFS DB queries executed per feed.
- **Labels:** `feed_code`

### `gtfs_db_query_duration`

- **Type:** Histogram
- **Unit:** ms
- **Description:** Duration of GTFS DB queries executed per feed.
- **Labels:** `feed_code`

### `gtfs_realtime_requests`

- **Type:** Counter
- **Unit:** requests
- **Description:** Number of GTFS-RT fetch requests.
- **Labels:** `feed_code`

### `gtfs_realtime_failures`

- **Type:** Counter
- **Unit:** failures
- **Description:** Number of GTFS-RT fetch failures.
- **Labels:** `feed_code`

## Feed Cache

### `feed_cache_hits`

- **Type:** Counter
- **Unit:** hits
- **Description:** Number of cache hits for a specified feed.
- **Labels:** `feed_code`

### `feed_cache_misses`

- **Type:** Counter
- **Unit:** misses
- **Description:** Number of cache misses for a specified feed.
- **Labels:** `feed_code`

### `feed_cache_ttl`

- **Type:** Histogram
- **Unit:** ms
- **Description:** Cache TTL for a specified feed.
- **Labels:** `feed_code`

## OneBusAway

### `onebusaway_request_count`

- **Type:** Counter
- **Unit:** requests
- **Description:** Number of requests made to the OneBusAway API.
- **Labels:** `feed_code`, `method`

### `onebusaway_response_count`

- **Type:** Counter
- **Unit:** responses
- **Description:** Number of responses received from the OneBusAway API.
- **Labels:** `feed_code`, `method`, `status`

### `onebusaway_request_duration`

- **Type:** Histogram
- **Unit:** ms
- **Description:** Duration of requests made to the OneBusAway API.
- **Labels:** `feed_code`, `method`

## Schedule

### `schedule_subscriptions`

- **Type:** Observable Gauge
- **Unit:** subscriptions
- **Description:** Number of active schedule subscriptions per feed.
- **Labels:** `feed_code`
