# Environment Variables

## Redis

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | Yes | Redis connection string. Used for caching and rate limiting. |

## Feed Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `FEEDS_CONFIG` | No | — | YAML string containing feed configuration. If not set, feeds are loaded from `feeds.yaml`. |
| `FEED_SYNC_SCHEDULE` | No | — | Cron expression for automatic feed syncing. If not set, feeds will not automatically sync. |
| `PRE_IMPORT_HOOK` | No | — | Shell command to run before a feed import. |
| `POST_IMPORT_HOOK` | No | — | Shell command to run after a feed import. |

## GTFS

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. |
| `GTFS_IMPORT_METHOD` | No | `copy` | Set to `insert` to use INSERT statements instead of COPY for importing GTFS data. |
| `GTFS_IMPORT_BATCH_SIZE` | No | `5000` | Number of rows per batch when importing GTFS data. Only used when `GTFS_IMPORT_METHOD` is `insert`. |
| `GTFS_RT_MIN_CACHE_AGE` | No | — | Minimum cache duration for GTFS Realtime data (e.g. `30s`, `1m`). Parsed with the `ms` library. |

## Caching

| Variable | Required | Default | Description |
|---|---|---|---|
| `LRU_CACHE_SIZE` | No | `1000` | Maximum number of items in the in-memory LRU cache. |

## Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOG_JSON` | No | `false` | Set to `true` to output logs as JSON. |
| `LOG_COMPACT` | No | `false` | Set to `true` to use compact log output. |

## HTTP Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `TRUST_PROXY` | No | — | Configures Express's `trust proxy` setting. Set to `true` to trust all proxies, or a string value for a specific configuration. |
| `INTERNAL_API_KEY` | No | — | Bearer token required to access internal API endpoints. If not set, all requests to internal endpoints are allowed (suitable for local development). |

## Schedule Subscriptions

| Variable | Required | Default | Description |
|---|---|---|---|
| `SCHEDULE_SUBSCRIBE_GRACE_PERIOD` | No | `1s` | Delay before a schedule subscription starts tracking metrics and fetching trips (e.g. `1s`, `500ms`). Connections that drop within this window do no work, which protects against clients that rapidly connect and disconnect. Parsed with the `ms` library. |

## Rate Limiting

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISABLE_RATE_LIMITS` | No | `false` | Set to `true` to disable rate limiting. |

## Notifications

| Variable | Required | Default | Description |
|---|---|---|---|
| `APPRISE_URLS` | No | — | Space-separated list of [Apprise](https://github.com/caronc/apprise) notification target URLs. |

## Connection Shedding

Connection shedding gradually disconnects WebSocket clients when CPU utilization is high, allowing the load balancer to route new connections to less-loaded instances.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SHED_ENABLED` | No | `false` | Set to `true` to enable connection shedding. |
| `SHED_CPU_HIGH_WATER` | No | `0.0625` | CPU utilization fraction (0–1) above which shedding is triggered. |
| `SHED_CPU_SAMPLE_INTERVAL` | No | `5s` | How often to sample CPU utilization (e.g. `5s`, `500ms`). Parsed with the `ms` library. |
| `SHED_CPU_WINDOW` | No | `60s` | Rolling window over which CPU utilization is averaged (e.g. `60s`, `1m`). Parsed with the `ms` library. |
| `SHED_EVAL_INTERVAL` | No | `10s` | How often to evaluate whether shedding should occur (e.g. `10s`, `500ms`). Parsed with the `ms` library. |
| `SHED_COOLDOWN` | No | `60s` | Minimum time between shedding events (e.g. `60s`, `1m`). Parsed with the `ms` library. |
| `SHED_BATCH_SIZE` | No | `10` | Number of connections to close per shedding event. |
| `SHED_MIN_CONNECTIONS` | No | `50` | Minimum number of connections to retain; shedding stops when at or below this count. |
| `SHED_SHARE_MARGIN` | No | `0.2` | Fraction of margin allowed above the fair connection share before shedding triggers. |
| `SHED_CLOSE_CODE` | No | `1001` | WebSocket close code sent to disconnected clients. |
| `SHED_DRAIN_BATCH_INTERVAL` | No | `1s` | Delay between batches during a graceful drain (e.g. `1s`). Parsed with the `ms` library. |
| `SHED_DRAIN_TIMEOUT` | No | `30s` | Maximum time to wait for connections to drain on shutdown (e.g. `30s`). Parsed with the `ms` library. |

## Sentry

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No | — | Sentry DSN for error reporting. |
| `SENTRY_DEBUG` | No | `false` | Set to `true` to enable Sentry's `debug` option. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.15` | Float between 0 and 1 controlling the Sentry transaction sampling rate. |
| `SENTRY_PROFILE_SESSION_SAMPLE_RATE` | No | `1` | Float between 0 and 1 controlling the Sentry profile session sampling rate. |
