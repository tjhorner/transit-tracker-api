import { Inject, Injectable, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import axios, { AxiosResponse } from "axios"
import * as csv from "fast-csv"
import * as fs from "fs"
import { Transaction } from "kysely"
import { tmpdir } from "node:os"
import { pipeline } from "node:stream/promises"
import * as path from "path"
import { rimraf } from "rimraf"
import * as unzipper from "unzipper"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { DB } from "./db"
import { GtfsDbService } from "./gtfs-db.service"
import { GtfsConfig } from "./gtfs.service"

@Injectable()
export class GtfsSyncService {
  private readonly logger: Logger
  private readonly feedCode: string
  private readonly config: GtfsConfig

  constructor(
    @Inject(REQUEST) { feedCode, config }: FeedContext<GtfsConfig>,
    private readonly db: GtfsDbService,
  ) {
    this.logger = new Logger(`${GtfsSyncService.name}[${feedCode}]`, {
      timestamp: true,
    })
    this.feedCode = feedCode
    this.config = config
  }

  async hasEverSynced() {
    return await this.db.tx(async (tx) => {
      const lastModified = await tx
        .selectFrom("import_metadata")
        .select("feed_code")
        .executeTakeFirst()

      return !!lastModified
    })
  }

  private async isUrlNewer(url: string) {
    const currentImportMetadata = await this.db.tx(async (tx) => {
      return await tx
        .selectFrom("import_metadata")
        .select(["last_modified", "etag"])
        .executeTakeFirst()
    })

    if (!currentImportMetadata) {
      return true
    }

    let response: AxiosResponse
    try {
      response = await axios.head(url)
    } catch (e: any) {
      if (e.status < 500) {
        response = await axios.get(url)
      } else {
        throw e
      }
    }

    const lastModified = response.headers["last-modified"]
    const etag = response.headers["etag"]

    if (!lastModified) {
      return currentImportMetadata.etag !== etag
    }

    return (
      new Date(lastModified) >
      (currentImportMetadata.last_modified ?? new Date(0))
    )
  }

  async import() {
    const url = this.config.static.url
    this.logger.log(
      `Starting import of feed "${this.feedCode}" from URL ${url}`,
    )

    if (!(await this.isUrlNewer(url))) {
      this.logger.log("Feed is not newer; import not required")
      return
    }

    const directory = path.join(tmpdir(), "gtfs-import")

    if (fs.existsSync(directory)) {
      await rimraf(directory)
    }

    fs.mkdirSync(directory)

    const zipDirectory = path.join(directory, "gtfs")

    this.logger.log(`Downloading and unzipping GTFS feed to ${zipDirectory}`)

    let newLastModified: Date | null = null
    let newEtag: string | null = null
    await axios({
      url,
      method: "get",
      responseType: "stream",
      responseEncoding: "binary",
      headers: this.config.static.headers,
    }).then((response) => {
      newLastModified = new Date(
        response.headers["last-modified"] ?? Date.now(),
      )
      newEtag = response.headers["etag"]

      const extractor = unzipper.Extract({ path: zipDirectory })

      return new Promise<void>((resolve, reject) => {
        response.data.pipe(extractor)

        let error: any = null
        extractor.on("error", (err) => {
          error = err
          extractor.end()
          reject(err)
        })

        extractor.on("close", () => {
          if (!error) {
            resolve()
          }
        })
      })
    })

    this.logger.log("Importing GTFS feed")
    await this.importFromDirectory(zipDirectory)

    this.logger.log("Updating import metadata")
    await this.db.tx(async (tx) => {
      await tx
        .insertInto("import_metadata")
        .values({
          etag: newEtag,
          last_modified: newLastModified,
          feed_code: this.feedCode,
        })
        .onConflict((oc) =>
          oc.column("feed_code").doUpdateSet({
            etag: newEtag,
            last_modified: newLastModified,
          }),
        )
        .execute()
    })

    this.logger.log("Cleaning up")
    await rimraf(directory)
  }

  async importFromDirectory(directory: string) {
    await this.db.tx(async (tx) => {
      await tx.deleteFrom("stop_times").execute()
      await tx.deleteFrom("trips").execute()
      await tx.deleteFrom("stops").execute()
      await tx.deleteFrom("routes").execute()
      await tx.deleteFrom("calendar_dates").execute()
      await tx.deleteFrom("calendar").execute()
      await tx.deleteFrom("agency").execute()
      await tx.deleteFrom("feed_info").execute()

      this.logger.log("Importing feed_info")
      await this.importFeedInfo(tx, path.join(directory, "feed_info.txt"))

      this.logger.log("Importing agency")
      await this.importAgency(tx, path.join(directory, "agency.txt"))

      this.logger.log("Importing calendar")
      await this.importCalendar(tx, path.join(directory, "calendar.txt"))

      this.logger.log("Importing calendar_dates")
      await this.importCalendarDates(
        tx,
        path.join(directory, "calendar_dates.txt"),
      )

      this.logger.log("Importing routes")
      await this.importRoutes(tx, path.join(directory, "routes.txt"))

      this.logger.log("Importing stops")
      await this.importStops(tx, path.join(directory, "stops.txt"))

      this.logger.log("Importing trips")
      await this.importTrips(tx, path.join(directory, "trips.txt"))

      this.logger.log("Importing stop_times")
      await this.importStopTimes(tx, path.join(directory, "stop_times.txt"))
    })

    this.logger.log("Import done")
  }

  private flushEmptyStrings(row: any) {
    for (const key in row) {
      if (row[key] === "") {
        row[key] = null
      }
    }

    return row
  }

  private async importGtfsFile<T extends keyof DB & string>(
    tx: Transaction<DB>,
    tableName: T,
    filePath: string,
    mapRow: (row: any) => any,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Skipping ${path.basename(filePath)}; file not found`)
      return Promise.resolve()
    }

    let completedRows = 0
    const insertRows = async (rows: any[]) => {
      this.logger.debug(
        `Inserting ${rows.length} ${tableName} rows ${completedRows} - ${completedRows + rows.length}`,
      )

      await tx.insertInto(tableName).values(rows).execute()

      completedRows += rows.length
    }

    const batch: any[] = []
    await pipeline(
      fs.createReadStream(filePath).pipe(
        csv.parse({
          headers: true,
          ignoreEmpty: true,
        }),
      ),
      async (rows: AsyncIterable<any>) => {
        for await (const item of rows) {
          batch.push(this.flushEmptyStrings(mapRow(item)))
          if (batch.length >= 5000) {
            await insertRows(batch)
            batch.length = 0
          }
        }
      },
    )

    if (batch.length > 0) {
      await insertRows(batch)
    }
  }

  private importFeedInfo(
    tx: Transaction<DB>,
    feedInfoPath: string,
  ): Promise<void> {
    return this.importGtfsFile(tx, "feed_info", feedInfoPath, (row) => ({
      feed_publisher_name: row.feed_publisher_name,
      feed_publisher_url: row.feed_publisher_url,
      feed_lang: row.feed_lang,
      feed_start_date: row.feed_start_date,
      feed_end_date: row.feed_end_date,
      feed_version: row.feed_version,
      feed_code: this.feedCode,
    }))
  }

  private importAgency(tx: Transaction<DB>, agencyPath: string): Promise<void> {
    return this.importGtfsFile(tx, "agency", agencyPath, (row) => ({
      agency_id: row.agency_id,
      agency_name: row.agency_name,
      agency_url: row.agency_url,
      agency_timezone: row.agency_timezone,
      agency_lang: row.agency_lang,
      agency_phone: row.agency_phone,
      agency_fare_url: row.agency_fare_url,
      agency_email: row.agency_email,
      feed_code: this.feedCode,
    }))
  }

  private importCalendar(
    tx: Transaction<DB>,
    calendarPath: string,
  ): Promise<void> {
    return this.importGtfsFile(tx, "calendar", calendarPath, (row) => ({
      service_id: row.service_id,
      monday: row.monday,
      tuesday: row.tuesday,
      wednesday: row.wednesday,
      thursday: row.thursday,
      friday: row.friday,
      saturday: row.saturday,
      sunday: row.sunday,
      start_date: row.start_date,
      end_date: row.end_date,
      feed_code: this.feedCode,
    }))
  }

  private importCalendarDates(
    tx: Transaction<DB>,
    calendarDatesPath: string,
  ): Promise<void> {
    return this.importGtfsFile(
      tx,
      "calendar_dates",
      calendarDatesPath,
      (row) => ({
        service_id: row.service_id,
        date: row.date,
        exception_type: row.exception_type,
        feed_code: this.feedCode,
      }),
    )
  }

  private importRoutes(tx: Transaction<DB>, routesPath: string): Promise<void> {
    return this.importGtfsFile(tx, "routes", routesPath, (row) => ({
      route_id: row.route_id,
      agency_id: row.agency_id,
      route_short_name: row.route_short_name,
      route_long_name: row.route_long_name,
      route_desc: row.route_desc,
      route_type: row.route_type,
      route_url: row.route_url,
      route_color: row.route_color,
      route_text_color: row.route_text_color,
      feed_code: this.feedCode,
    }))
  }

  private importStops(tx: Transaction<DB>, stopsPath: string): Promise<void> {
    return this.importGtfsFile(tx, "stops", stopsPath, (row) => ({
      stop_id: row.stop_id,
      stop_code: row.stop_code,
      stop_name: row.stop_name,
      stop_desc: row.stop_desc,
      stop_lat: row.stop_lat,
      stop_lon: row.stop_lon,
      zone_id: row.zone_id,
      stop_url: row.stop_url,
      location_type: row.location_type,
      parent_station: row.parent_station,
      stop_timezone: row.stop_timezone,
      wheelchair_boarding: row.wheelchair_boarding,
      feed_code: this.feedCode,
    }))
  }

  private importStopTimes(
    tx: Transaction<DB>,
    stopTimesPath: string,
  ): Promise<void> {
    return this.importGtfsFile(tx, "stop_times", stopTimesPath, (row) => ({
      trip_id: row.trip_id,
      arrival_time: row.arrival_time,
      departure_time: row.departure_time,
      stop_id: row.stop_id,
      stop_sequence: row.stop_sequence,
      stop_headsign: row.stop_headsign,
      pickup_type: row.pickup_type,
      drop_off_type: row.drop_off_type,
      shape_dist_traveled: row.shape_dist_traveled,
      feed_code: this.feedCode,
    }))
  }

  private importTrips(tx: Transaction<DB>, tripsPath: string): Promise<void> {
    return this.importGtfsFile(tx, "trips", tripsPath, (row) => ({
      route_id: row.route_id,
      service_id: row.service_id,
      trip_id: row.trip_id,
      trip_headsign: row.trip_headsign,
      trip_short_name: row.trip_short_name,
      direction_id: row.direction_id,
      block_id: row.block_id,
      shape_id: row.shape_id,
      wheelchair_accessible: row.wheelchair_accessible,
      bikes_allowed: row.bikes_allowed,
      feed_code: this.feedCode,
    }))
  }
}
