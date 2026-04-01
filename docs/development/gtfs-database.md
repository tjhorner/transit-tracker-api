# Working with the GTFS Database

The GTFS feed provider uses a Postgres database to store and query imported GTFS feeds. If you need to make schema changes, you'll find this useful.

## Development Database

You can easily stand up a database for development using [Docker](https://www.docker.com/). The included `docker-compose.dev.yml` includes the external service dependencies required for development, including a Postgres database.

Once you have gone through the [development quickstart](quickstart.md), run these commands to get started:

```shell
docker compose -f docker-compose.dev.yml up -d
pnpm gtfs:db:migrate
```

Your development database is now ready! [Configure a GTFS feed](../configuration/gtfs.md) then run this command to import it:

```shell
pnpm cli sync
```

## Migrations

This project uses [`dbmate`](https://www.npmjs.com/package/dbmate) to create, manage, and apply database migrations.

### Create Migrations

To create a new migration, run this command:

```shell
pnpx dbmate new migration-name-here
```

`dbmate` will create a new empty migration in `db/migrations/`. Write the queries necessary to apply and reverse the migration.

### Apply Migrations

To apply new migrations:

```shell
pnpm gtfs:db:migrate
```

### Rolling Back Migrations

To roll back the latest migration:

```shell
pnpm gtfs:db:rollback
```

## Queries

This project uses [PgTyped](https://pgtyped.dev/) to generate type-safe representations of PostgreSQL queries.

Queries used to retrieve data are in `src/modules/feed/modules/gtfs/queries`, and those used for sync are in `src/modules/feed/modules/gtfs/sync/queries`. You should **NOT** modify the TypeScript files directly.

When modifying the source queries, you'll want to run PgTyped in watch mode so it automatically updates the corresponding TypeScript files:

```shell
pnpm gtfs:db:pgtyped
```

Once you're done editing queries, make sure to [format](quickstart.md#formatting) your changes.
