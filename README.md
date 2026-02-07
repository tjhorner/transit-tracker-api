# Transit Tracker API

This is an API that is intended to be used to power a live arrivals or departures board, like [this one](https://github.com/EastsideUrbanism/transit-countdown-clock). Given a source transit feed, it will provide a WebSocket-based API that can be used to subscribe to schedule data for specific routes and stops. It can support multiple feeds at once.

## Installation

The service is distributed as a Docker image that runs on port 3000 by default. You can learn how to deploy it with the [Docker deployment guide](./docs/deployment/deploy-docker.md).

To easily deploy a hosted instance of the API, check out the [Fly.io deployment guide](./docs/deployment/deploy-fly.md).

### Feed Configuration

After installation, you will need to set up a feeds configuration. This will tell the API where to fetch the transit data from. These providers are currently supported:

- [GTFS / GTFS-realtime](https://gtfs.org/documentation/overview/)
- [OneBusAway](https://developer.onebusaway.org/)
- [HAFAS](https://github.com/public-transport/hafas-client) (⚠️ experimental ⚠️)

Most transit agencies will support GTFS. [Transitland](https://www.transit.land/operators) keeps an index of all known GTFS/GTFS-rt feeds, so you can use that to find the feed URL for yours.

> [!NOTE]  
> Not all parts of the GTFS specification are supported. For example, [`frequencies.txt`](https://gtfs.org/documentation/schedule/reference/#frequenciestxt) is not supported, so if your transit agency uses it you will see incorrect or missing trips. PRs are welcome to add support for more GTFS features.

You can create a `feeds.yaml` in the working directory, or provide it as a `FEEDS_CONFIG` environment variable. A [JSON Schema](./schemas/feeds.schema.json) is available and describes each available configuration option in more detail. Here is an example:

```yaml
feeds:
  st: # <-- CHANGE THIS to something short and unique to each feed
    name: Puget Sound Region
    description: All transit agencies in the Puget Sound region
    # You can optionally override the service area polygon for a feed.
    # By default this is determined by the locations of the feed's stops.
    # It's advisable to set for OneBusAway-based feeds since OneBusAway can only
    # return up to 250 stops at a time and does not support pagination, so the
    # calculated service area can potentially be incomplete.
    serviceArea: [[[-122.97713,47.071983],[-123.01475,48.535065],[-122.9441,48.59793],[-121.633194,48.26319],[-121.60341,48.255344],[-121.6016,48.25484],[-121.60102,48.251865],[-121.601,48.25134],[-121.6923,47.85279],[-121.78612,47.491642],[-121.98235,47.199947],[-122.57929,46.933628],[-122.58955,46.93304],[-122.91552,46.979607],[-122.931404,46.98552],[-122.97713,47.071983]]]
    onebusaway:
      baseUrl: https://api.pugetsound.onebusaway.org
      apiKey: your_oba_api_key
  nctd:
    name: North County Transit District
    description: San Diego, California
    gtfs:
      static:
        url: https://lfportal.nctd.org/staticGTFS/google_transit.zip
      # If your transit agency doesn't support GTFS-rt, you can omit this section
      rtTripUpdates:
        url: https://api.goswift.ly/real-time/nctd/gtfs-rt-trip-updates
        headers:
          Authorization: your_swiftly_api_key
```

Due to its increased complexity, additional documentation on configuring GTFS feeds is [available here](./docs/configuration/gtfs.md).

### GTFS Database Setup

> [!NOTE]  
> This setup is only required if one or more of your feeds is a GTFS feed.

To facilitate fast queries of the static GTFS data, the API uses a PostgreSQL database to store and index it.

Run the following command to perform the migrations on your PostgreSQL database:

```bash
# Replace your DATABASE_URL below
DATABASE_URL="postgres://postgres:your_password@localhost:5432/gtfs?sslmode=disable" pnpm gtfs:db:migrate
```

## Usage

The REST API is described with an OpenAPI specification at `/openapi`.

There is also a WebSocket interface that can be used to subscribe to real-time schedule updates. Connect to the API at its base URL and send a message with the following structure:

```json
{
  "event": "schedule:subscribe",
  "data": {
    "routeStopPairs": "st:1_100113,st:1_71971;st:1_102704,st:1_71971",
    "limit": 3
  }
}
```

The following parameters are available to tweak the schedule data:

- `limit`: The maximum number of trips to return in a single update.
- `sortByDeparture`: Sort trips by departure time rather than arrival time. This is useful for routes with long dwell times at stops.
- `listMode`: If `sequential`, then all trips across all routes will be returned in order of arrival or departure time. If `nextPerRoute`, then only the next trip for each route will be returned.

Once subscribed, you will receive updates to your desired schedule in the following format:

```json
{
  "event": "schedule",
  "data": {
    "trips": [
      {
        "tripId": "1_681754457",
        "stopId": "1_71971",
        "routeId": "1_100113",
        "routeName": "221",
        "stopName": "NE Redmond Way & Bear Creek Pkwy",
        "headsign": "Eastgate P&R",
        "arrivalTime": 1737346216,
        "departureTime": 1737346216,
        "isRealtime": true
      },
      {
        "tripId": "1_464093197",
        "stopId": "1_71971",
        "routeId": "1_102704",
        "routeName": "250",
        "stopName": "NE Redmond Way & Bear Creek Pkwy",
        "headsign": "Bellevue Transit Center",
        "arrivalTime": 1737346424,
        "departureTime": 1737346424,
        "isRealtime": true
      },
      {
        "tripId": "1_464093207",
        "stopId": "1_71971",
        "routeId": "1_102704",
        "routeName": "250",
        "stopName": "NE Redmond Way & Bear Creek Pkwy",
        "headsign": "Bellevue Transit Center",
        "arrivalTime": 1737347652,
        "departureTime": 1737347652,
        "isRealtime": true
      }
    ]
  }
}
```

# License

```
MIT License

Copyright (c) 2025 TJ Horner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```