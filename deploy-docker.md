# Deploying with Docker

This service is distributed as a Docker image accessible as `ghcr.io/tjhorner/transit-tracker-api:main`. You can deploy it on any platform where OCI images are supported.

## Example: Docker Compose

An example Docker Compose file is included at [`docker-compose.example.yml`](./docker-compose.example.yml) for your reference. It includes the API service, a Postgres database to store GTFS data, and a Redis cache. The API is configured to use King County Metro's GTFS and GTFS-rt feeds, but you can [change this](./README.md#feed-configuration).

If you're not using a GTFS feed, you can remove the `postgres` service and the `DATBASE_URL` environment variable.

This guide will assume you copied `docker-compose.example.yml` somewhere else and renamed it to `docker-compose.yml`.

### First Run (GTFS Only)

If using GTFS feeds, you will need to run a few commands to initialize the database and run the initial sync.

```shell
docker compose run --rm api "pnpm gtfs:db:migrate && node ./dist/cli sync"
```

### Running the Services

To start the services, run:

```shell
docker compose up
```

This will start the API on port 3000 by default. You can access it at `http://localhost:3000`. For example, you can visit `http://localhost:3000/feeds` to see the list of feeds.
