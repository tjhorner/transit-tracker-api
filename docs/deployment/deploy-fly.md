# Deploying on Fly.io

> [!WARNING]  
> This guide is partially outdated and contains some slightly incorrect information. It will be updated soon™.

If you want to easily stand up your own Transit Tracker API server then Fly.io is a great option since it's cheap but easy to scale if you need to. This guide will walk you through the steps to deploy your own instance on Fly.io.

## Prerequisites

- An account on [Fly.io](https://fly.io/)
- The [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/) installed

## Create Fly App

First, make an empty directory where you want the repository cloned, then create a Fly app using this repository as a template with this command:

```bash
fly launch --from https://github.com/tjhorner/transit-tracker-api --copy-config --no-db --no-redis --no-deploy
```

We will deploy it later.

## Deploy GTFS Database

> [!NOTE]  
> You only need to follow this section if you are using GTFS feeds. If you are only using OneBusAway feeds, you can skip this section.

The API uses a Postgres database to import and query GTFS feed data. We will use [Fly Postgres](https://fly.io/docs/postgres/) to set one up.

### Create Database

Run this command to provision a new Fly Postgres app:

```bash
fly postgres create
```

It will ask a few questions like name, region, and database size. You can change these, but the defaults are sufficient for this guide.

Once the database is created, export the provided connection string as `DATABASE_URL`. For example:

```shell
export DATABASE_URL="postgres://username:password@postgres-app-name.flycast:5432"
```

## Deploy Redis

The API uses Redis for caching, rate limit management, and scheduling sync of GTFS feeds. We will use Fly's integration with [Upstash](https://fly.io/docs/upstash/redis/) to create a Redis instance.

### Create Redis Instance

Run this command to provision a new Redis instance on Upstash:

```bash
fly redis create
```

It will ask a few questions like name and region. You can change these, but the defaults are sufficient for this guide.

The command will output the name and connection string for your new Redis instance. Export it as `REDIS_URL`. For example:

```bash
export REDIS_URL="redis://default:abcd1234@fly-redis-app-name.upstash.io:6379"
```

## Create Feed Configuration

The feed configuration file defines which feeds are available via the API and how to access them. We will create one now, using King County Metro's GTFS feed as an example.

Create a file named `feeds.yaml` with the following contents:

```yaml
feeds:
  kcm: # <-- CHANGE THIS to something short and unique to each feed
    name: King County Metro
    description: King County, Washington
    gtfs:
      static:
        url: https://metro.kingcounty.gov/GTFS/google_transit.zip
      rtTripUpdates:
        url: https://s3.amazonaws.com/kcm-alerts-realtime-prod/tripupdates.pb
```

You can read more about the configuration file format in [the README](./README.md#feed-configuration).

## Deploy the API

Now that we have our Postgres database, Redis instance, and feed configuration ready, we can deploy the API.

### Deploy Fly App

Let's set the appropriate secrets for the app now:

```bash
fly secrets set --stage "DATABASE_URL=$DATABASE_URL/gtfs?sslmode=disable" "REDIS_URL=$REDIS_URL/?family=6" "FEEDS_CONFIG=$(cat feeds.yaml)"
```

And deploy the app:

```bash
fly deploy
```

Now visit `/feeds` at your app URL, e.g. `https://your-app-name.fly.dev/feeds`, to see the available feeds. If you see a list of feeds, congratulations! You're done.

## Updates

To deploy updates from upstream, run the following command:

```bash
git stash push fly.toml && git pull origin main && git stash pop
```

This will retain the local changes made to your `fly.toml` file but update the rest of the repository. You can then run `fly deploy` to deploy the changes. (Yes, this is unfortunately a bit annoying.)
