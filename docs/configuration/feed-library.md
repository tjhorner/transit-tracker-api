# Feed Library

This is a library of feeds used in [Eastside Urbanism's API deployment](https://github.com/tjhorner/transit-tracker-api), drawn directly from its `feeds.yaml`. Each entry below is a ready-to-use snippet you can add to your own `feeds.yaml`.

Some feeds require an API key. Where that's the case, the snippet uses a `YOUR_API_KEY` placeholder and the entry notes where to register for one.

## Puget Sound Region

All transit agencies in the Puget Sound region.

> **Requires an API key.** [Request one on the Sound Transit website](https://www.soundtransit.org/help-contacts/business-information/open-transit-data-otd).

```yaml
feeds:
  st:
    name: Puget Sound Region
    description: All transit agencies in the Puget Sound region
    serviceArea: [[[-122.97713,47.071983],[-123.01475,48.535065],[-122.9441,48.59793],[-121.633194,48.26319],[-121.60341,48.255344],[-121.6016,48.25484],[-121.60102,48.251865],[-121.601,48.25134],[-121.6923,47.85279],[-121.78612,47.491642],[-121.98235,47.199947],[-122.57929,46.933628],[-122.58955,46.93304],[-122.91552,46.979607],[-122.931404,46.98552],[-122.97713,47.071983]]]
    onebusaway:
      baseUrl: https://api.pugetsound.onebusaway.org
      apiKey: YOUR_API_KEY
      rateLimiter:
        enabled: false
```

## San Diego Metropolitan Transit System

San Diego, California

> **Requires an API key.** [Request one on the MTS website](https://www.sdmts.com/business-center/app-developers/real-time-data).

```yaml
feeds:
  sdmts:
    name: San Diego Metropolitan Transit System
    description: San Diego, California
    serviceArea: [[[-117.12424,32.53477],[-116.01363,32.62708],[-116.30687,33.3423],[-117.34011,33.13268],[-117.30611,33.01877],[-117.27216,32.88384],[-117.2855,32.8198],[-117.25596,32.77281],[-117.26628,32.7141],[-117.24624,32.65059],[-117.21908,32.67666],[-117.16937,32.6634],[-117.14574,32.61354],[-117.1296,32.53777],[-117.12424,32.53477]]]
    onebusaway:
      baseUrl: https://realtime.sdmts.com/api
      apiKey: YOUR_API_KEY
```

## NY MTA Buses

New York City, New York, USA

> **Requires an API key.** [Request one here](https://register.developer.obanyc.com/).

```yaml
feeds:
  nymtabus:
    name: NY MTA Buses
    description: New York City, New York, USA
    serviceArea: [[[-74.2197,41.11954],[-74.2197,40.39157],[-72.52833,40.39157],[-72.52833,41.11954],[-74.2197,41.11954]]]
    onebusaway:
      baseUrl: https://bustime.mta.info
      apiKey: YOUR_API_KEY
```

## NYC Subway

New York City, New York, USA

```yaml
feeds:
  nycsubway:
    name: NYC Subway
    description: New York City, New York, USA
    gtfs:
      quirks:
        fuzzyMatchTripUpdates: true
      static:
        url: https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
      rtTripUpdates:
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace
          routeIds: ["A","C","E","H"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm
          routeIds: ["B","D","F","FX","M","FS"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g
          routeIds: ["G"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz
          routeIds: ["J","Z"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw
          routeIds: ["N","Q","R","W"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l
          routeIds: ["L"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs
          routeIds: ["1","2","3","4","5","6","6X","7","7X","GS"]
        - url: https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si
          routeIds: ["SI"]
```

## NYC Ferry

New York City, New York, USA

```yaml
feeds:
  nycferry:
    name: NYC Ferry
    description: New York City, New York, USA
    gtfs:
      static:
        url: https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx
      rtTripUpdates:
        url: https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/tripupdate
```

## North County Transit District

San Diego, California

> **Requires an API key.** [Request one with Swiftly's form](https://docs.google.com/forms/d/e/1FAIpQLScy9Jye91QPSTS3WVEU-13es0A1rT9Ep5JhAmXUZEiop7fmIw/viewform).

```yaml
feeds:
  nctd:
    name: North County Transit District
    description: San Diego, California
    gtfs:
      static:
        url: https://lfportal.nctd.org/staticGTFS/google_transit.zip
      rtTripUpdates:
        url: https://api.goswift.ly/real-time/nctd/gtfs-rt-trip-updates
        headers:
          Authorization: YOUR_API_KEY
```

## Whatcom Transportation Authority

Whatcom County, Washington, USA

```yaml
feeds:
  wta:
    name: Whatcom Transportation Authority
    description: Whatcom County, Washington, USA
    gtfs:
      static:
        url: https://github.com/whatcomtrans/publicwtadata/raw/master/GTFS/wta_gtfs_latest.zip
      rtTripUpdates:
        url: https://bustracker.ridewta.com/gtfsrt/trips
```

## Amtrak

National rail service in the USA

```yaml
feeds:
  amtrak:
    name: Amtrak
    description: National rail service in the USA
    gtfs:
      static:
        url: https://content.amtrak.com/content/gtfs/GTFS.zip
      rtTripUpdates:
        url: https://asm-backend.transitdocs.com/gtfs/amtrak
```

## WMATA

Washington, D.C.

> **Requires an API key.** [Register for one here](https://developer.wmata.com/signup/).

```yaml
feeds:
  wmata:
    name: WMATA
    description: Washington, D.C.
    gtfs:
      static:
        url: https://api.wmata.com/gtfs/rail-bus-gtfs-static.zip
        headers:
          api_key: YOUR_API_KEY
      rtTripUpdates:
        - url: https://api.wmata.com/gtfs/bus-gtfsrt-tripupdates.pb
          headers:
            api_key: YOUR_API_KEY
        - url: https://api.wmata.com/gtfs/rail-gtfsrt-tripupdates.pb
          headers:
            api_key: YOUR_API_KEY
```

## VBB

Berlin, Germany

```yaml
feeds:
  vbb:
    name: VBB
    description: Berlin, Germany
    serviceArea: [[[11.044298,53.778732],[11.277453,53.104374],[11.625322,52.122395],[11.63004,52.109203],[11.987085,51.47751],[12.931404,50.839245],[14.805488,50.904495],[17.037088,51.09808],[14.169586,53.949837],[14.022905,54.03529],[13.959447,54.06598],[13.83143,54.116756],[13.773084,54.138763],[13.077321,54.308624],[12.487015,54.251015],[11.044298,53.778732]]]
    gtfs:
      static:
        url: https://www.vbb.de/fileadmin/user_upload/VBB/Dokumente/API-Datensaetze/gtfs-mastscharf/GTFS.zip
```

## MVG

Munich, Germany

```yaml
feeds:
  mvg:
    name: MVG
    description: Munich, Germany
    serviceArea: [[[11.32068,48.16715],[11.31867,48.15862],[11.34347,48.11251],[11.34876,48.10802],[11.51655,48.03436],[11.52718,48.03314],[11.72352,48.06547],[11.73377,48.0739],[11.73549,48.10726],[11.73535,48.10892],[11.72865,48.13829],[11.72847,48.13894],[11.6846,48.26667],[11.67641,48.27302],[11.67634,48.27304],[11.67074,48.27366],[11.44164,48.26647],[11.4316,48.26298],[11.32068,48.16715]]]
    mvg: {}
```

## Toronto Transit Commission

Toronto, Canada

```yaml
feeds:
  ttc:
    name: Toronto Transit Commission
    description: Toronto, Canada
    gtfs:
      static:
        url: https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/bd4809dd-e289-4de8-bbde-c5c00dafbf4f/resource/28514055-d011-4ed7-8bb0-97961dfe2b66/download/SurfaceGTFS.zip
      rtTripUpdates:
        url: https://bustime.ttc.ca/gtfsrt/trips
```

## TransLink

Metro Vancouver, Canada

> **Requires an API key.** [Register for one here](https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources).

```yaml
feeds:
  translink:
    name: TransLink
    description: Metro Vancouver, Canada
    gtfs:
      static:
        url: https://gtfs-static.translink.ca/gtfs/google_transit.zip
      rtTripUpdates:
        url: https://gtfsapi.translink.ca/v3/gtfsrealtime?apikey=YOUR_API_KEY
```

## Winnipeg Transit

Winnipeg, Canada

```yaml
feeds:
  wpt:
    name: Winnipeg Transit
    description: Winnipeg, Canada
    gtfs:
      static:
        url: http://gtfs.winnipegtransit.com/google_transit.zip
```

## Dallas Area Rapid Transit

Dallas, Texas, USA

```yaml
feeds:
  dart:
    name: Dallas Area Rapid Transit
    description: Dallas, Texas, USA
    gtfs:
      static:
        url: http://www.dart.org/transitdata/latest/google_transit.zip
```

## TriMet

Portland, Oregon, USA

> **Requires an API key.** [Register for one here](https://developer.trimet.org/appid/registration/).

```yaml
feeds:
  trimet:
    name: TriMet
    description: Portland, Oregon, USA
    gtfs:
      static:
        url: http://developer.trimet.org/schedule/gtfs.zip
      rtTripUpdates:
        url: http://developer.trimet.org/ws/V1/TripUpdate?appID=YOUR_API_KEY
```

## C-TRAN

Clark County, Washington, USA

```yaml
feeds:
  ctran:
    name: C-TRAN
    description: Clark County, Washington, USA
    gtfs:
      static:
        url: https://www.c-tran.com/images/Google/GoogleTransitUpload.zip
```

## NJ Transit Buses

New Jersey, USA

```yaml
feeds:
  njtbus:
    name: NJ Transit Buses
    description: New Jersey, USA
    gtfs:
      static:
        url: https://www.njtransit.com/bus_data.zip
```

## NJ Transit Rail

New Jersey, USA

```yaml
feeds:
  njtrail:
    name: NJ Transit Rail
    description: New Jersey, USA
    gtfs:
      static:
        url: https://www.njtransit.com/rail_data.zip
```

## DASH

Alexandria, Virginia, USA

> **Requires an API key.** [Request one at DASH's website](https://www.dashbus.com/tracker-data).

```yaml
feeds:
  dash:
    name: DASH
    description: Alexandria, Virginia, USA
    gtfs:
      static:
        url: https://www.dashbus.com/google_transit.zip
      rtTripUpdates:
        url: https://api.goswift.ly/real-time/alexandria-dash/gtfs-rt-trip-updates
        headers:
          Authorization: YOUR_API_KEY
```

## RTD Denver

Denver, Colorado, USA

```yaml
feeds:
  denver:
    name: RTD Denver
    description: Denver, Colorado, USA
    gtfs:
      static:
        url: https://www.rtd-denver.com/files/gtfs/google_transit.zip
      rtTripUpdates:
        url: https://www.rtd-denver.com/files/gtfs-rt/TripUpdate.pb
```

## City of Madison Metro

Madison, Wisconsin, USA

```yaml
feeds:
  madison:
    name: City of Madison Metro
    description: Madison, Wisconsin, USA
    gtfs:
      static:
        url: http://transitdata.cityofmadison.com/GTFS/mmt_gtfs.zip
      rtTripUpdates:
        url: https://metromap.cityofmadison.com/gtfsrt/trips
```

## Société de transport de Montréal

Montreal, Canada

> **Requires an API key.** [Register for one here](https://www.stm.info/en/about/developers/faq-new-api-hub).

```yaml
feeds:
  stm:
    name: Société de transport de Montréal
    description: Montreal, Canada
    gtfs:
      static:
        url: http://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip
      rtTripUpdates:
        url: https://api.stm.info/pub/od/gtfs-rt/ic/v2/tripUpdates
        headers:
          apiKey: YOUR_API_KEY
```

## Massachusetts Bay Transportation Authority

Boston, Massachusetts, USA

```yaml
feeds:
  mbta:
    name: Massachusetts Bay Transportation Authority
    description: Boston, Massachusetts, USA
    gtfs:
      static:
        url: https://cdn.mbta.com/MBTA_GTFS.zip
      rtTripUpdates:
        url: https://cdn.mbta.com/realtime/TripUpdates.pb
```

## Chicago Transit Authority

Chicago, Illinois, USA

```yaml
feeds:
  cta:
    name: Chicago Transit Authority
    description: Chicago, Illinois, USA
    gtfs:
      static:
        url: https://www.transitchicago.com/downloads/sch_data/google_transit.zip
```

## Ilévia

Lille, France

```yaml
feeds:
  ilevia:
    name: Ilévia
    description: Lille, France
    gtfs:
      static:
        url: https://media.ilevia.fr/opendata/gtfs.zip
      rtTripUpdates:
        url: https://proxy.transport.data.gouv.fr/resource/ilevia-lille-gtfs-rt
```

## Réseau de transport de la Capitale

Québec City, Canada

```yaml
feeds:
  rtc:
    name: Réseau de transport de la Capitale
    description: Québec City, Canada
    gtfs:
      static:
        url: https://cdn.rtcquebec.ca/Site_Internet/DonneesOuvertes/googletransit.zip
      rtTripUpdates:
        url: https://realtime-data-api.transitapp.com/v3/real_time/feeds/6/gtfs_rt/trip_updates
```

## Metra

Chicago, Illinois, USA

> **Requires an API key.** [Request one here](https://metra.com/developers).

```yaml
feeds:
  metra:
    name: Metra
    description: Chicago, Illinois, USA
    gtfs:
      static:
        url: https://schedules.metrarail.com/gtfs/schedule.zip
      rtTripUpdates:
        url: https://gtfspublic.metrarr.com/gtfs/public/tripUpdates?api_token=YOUR_API_KEY
```

## Tranvías de La Coruña

La Coruña, Spain

> **Requires an API key.** [Request one here](https://nap.transportes.gob.es).

```yaml
feeds:
  tlc:
    name: Tranvías de La Coruña
    description: La Coruña, Spain
    gtfs:
      static:
        url: https://nap.transportes.gob.es/api/Fichero/download/1574
        headers:
          ApiKey: YOUR_API_KEY
```

## OC Transpo

Ottawa, Canada

> **Requires an API key.** [Request one here](https://nextrip-public-api.developer.azure-api.net/).

```yaml
feeds:
  oct:
    name: OC Transpo
    description: Ottawa, Canada
    gtfs:
      static:
        url: https://oct-gtfs-emasagcnfmcgeham.z01.azurefd.net/public-access/GTFSExport.zip
      rtTripUpdates:
        url: https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates
        headers:
          Ocp-Apim-Subscription-Key: YOUR_API_KEY
```

## Houston Metro

Houston, Texas

> **Requires an API key.** [Request one here](https://api-portal.ridemetro.org/).

```yaml
feeds:
  houston:
    name: Houston Metro
    description: Houston, Texas
    gtfs:
      static:
        url: https://metro.resourcespace.com/pages/download.php?ref=4835&ext=zip
      rtTripUpdates:
        url: https://api.ridemetro.org/GtfsRealtime/TripUpdates
        headers:
          Ocp-Apim-Subscription-Key: YOUR_API_KEY
```

## Milwaukee County Transit System

Milwaukee, Wisconsin, USA

```yaml
feeds:
  mcts:
    name: Milwaukee County Transit System
    description: Milwaukee, Wisconsin, USA
    gtfs:
      static:
        url: https://kamino.mcts.org/gtfs/google_transit.zip
      rtTripUpdates:
        url: https://realtime.ridemcts.com/gtfsrt/trips
```

## Edmonton Transit System

Edmonton, Canada

```yaml
feeds:
  ets:
    name: Edmonton Transit System
    description: Edmonton, Canada
    gtfs:
      static:
        url: https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/GTFS/gtfs.zip
      rtTripUpdates:
        url: http://gtfs.edmonton.ca/TMGTFSRealTimeWebService/TripUpdate/TripUpdates.pb
```

## Link Transit

Wenatchee, Washington, USA

```yaml
feeds:
  link:
    name: Link Transit
    description: Wenatchee, Washington, USA
    gtfs:
      static:
        url: https://link.rideralerts.com/InfoPoint/gtfs-zip.ashx
      rtTripUpdates:
        url: https://link.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=TripUpdate
```

## SEPTA Rail

Philadelphia, Pennsylvania, USA

```yaml
feeds:
  septarail:
    name: SEPTA Rail
    description: Philadelphia, Pennsylvania, USA
    gtfs:
      static:
        url: https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip#google_rail.zip
      rtTripUpdates:
        url: https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb
```

## SEPTA Bus

Philadelphia, Pennsylvania, USA

```yaml
feeds:
  septabus:
    name: SEPTA Bus
    description: Philadelphia, Pennsylvania, USA
    gtfs:
      static:
        url: https://github.com/septadev/GTFS/releases/latest/download/gtfs_public.zip#google_bus.zip
      rtTripUpdates:
        url: https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb
```

## MARTA

Atlanta, Georgia, USA

```yaml
feeds:
  marta:
    name: MARTA
    description: Atlanta, Georgia, USA
    gtfs:
      static:
        url: https://itsmarta.com/google_transit_feed/google_transit.zip
      rtTripUpdates:
        url: https://gtfs-rt.itsmarta.com/TMGTFSRealTimeWebService/tripupdate/tripupdates.pb
```

## Pioneer Valley Transit Authority

Western Massachusetts, USA

> **Requires an API key.** [Request one with Swiftly's form](https://docs.google.com/forms/d/e/1FAIpQLScy9Jye91QPSTS3WVEU-13es0A1rT9Ep5JhAmXUZEiop7fmIw/viewform).

```yaml
feeds:
  pvta:
    name: Pioneer Valley Transit Authority
    description: Western Massachusetts, USA
    gtfs:
      static:
        url: https://www.pvta.com/g_trans/google_transit.zip
      rtTripUpdates:
        url: https://api.goswift.ly/real-time/pioneer-valley-pvta/gtfs-rt-trip-updates
        headers:
          Authorization: YOUR_API_KEY
```
