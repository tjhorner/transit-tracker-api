# Transit Tracker API

This is an API that is intended to be used to power a live arrivals or departures board, like [this one](https://github.com/EastsideUrbanism/transit-countdown-clock). Given a source transit feed, it will provide a WebSocket-based API that can be used to subscribe to schedule data for specific routes and stops. It can support multiple feeds at once.

## Installation

The service is distributed as a Docker image that runs on port 3000 by default. You can find an example `docker-compose.yml` in the root of this repo.

To easily deploy an instance of the API, check out the [Fly.io deployment guide](./fly-deploy.md).

### Feed Configuration

After installation, you will need to set up a feeds configuration. This will tell the API where to fetch the transit data from. These providers are currently supported:

- [GTFS / GTFS-realtime](https://gtfs.org/documentation/overview/)
- [OneBusAway](https://developer.onebusaway.org/)

Most transit agencies will support GTFS. [Transitland](https://www.transit.land/operators) keeps an index of all known GTFS/GTFS-rt feeds, so you can use that to find the feed URL for yours.

> [!NOTE]  
> Not all parts of the GTFS specification are supported. For example, [`frequencies.txt`](https://gtfs.org/documentation/schedule/reference/#frequenciestxt) is not supported, so if your transit agency uses it you will see incorrect or missing trips. PRs are welcome to add support for more GTFS features.

You can create a `feeds.yaml` in the working directory, or provide it as a `FEEDS_CONFIG` environment variable. Here is an example configuration:

```yaml
feeds:
  st:
    name: Puget Sound Region
    description: All transit agencies in the Puget Sound region
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

### GTFS Database Setup

> [!NOTE]  
> This setup is only required if one of your feeds is a GTFS feed. If you are only using OneBusAway feeds, you can skip it.

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
    "feedCode": "st",
    "routeStopPairs": "1_100113,1_71971;1_102704,1_71971",
    "limit": 3
  }
}
```

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