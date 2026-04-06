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

## Rate Limiting

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISABLE_RATE_LIMITS` | No | `false` | Set to `true` to disable rate limiting. |

## Notifications

| Variable | Required | Default | Description |
|---|---|---|---|
| `APPRISE_URLS` | No | — | Space-separated list of [Apprise](https://github.com/caronc/apprise) notification target URLs. |

## Sentry

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No | — | Sentry DSN for error reporting. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.15` | Float between 0 and 1 controlling the Sentry transaction sampling rate. |
| `SENTRY_PROFILE_SESSION_SAMPLE_RATE` | No | `1` | Float between 0 and 1 controlling the Sentry profile session sampling rate. |
