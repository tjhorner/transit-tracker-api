import { Injectable, Logger } from "@nestjs/common"
import { Kysely, sql, Transaction } from "kysely"
import { InjectKysely } from "nestjs-kysely"
import { DB } from "./db"
import * as csv from "fast-csv"
import * as fs from "fs"
import * as path from "path"
import axios from "axios"
import * as unzipper from "unzipper"
import { rimraf } from "rimraf"

@Injectable()
export class GtfsSyncService {
  private readonly logger = new Logger(GtfsSyncService.name)

  constructor(@InjectKysely() private readonly db: Kysely<DB>) {}

  private async isUrlNewer(feedCode: string, url: string) {
    const currentFeedLastModified = await this.db
      .transaction()
      .execute(async (tx) => {
        await sql`SET LOCAL app.current_feed = '${sql.raw(feedCode)}';`.execute(
          tx,
        )
        return await tx
          .selectFrom("import_metadata")
          .select("last_modified")
          .executeTakeFirst()
      })

    if (!currentFeedLastModified) {
      return true
    }

    const response = await axios.head(url)
    const lastModified = new Date(response.headers["last-modified"])

    return lastModified > currentFeedLastModified.last_modified
  }

  async importFromUrl(feedCode: string, url: string) {
    if (!(await this.isUrlNewer(feedCode, url))) {
      this.logger.log("Feed is not newer; import not required")
      return
    }

    const tmpDir = (await import("temp-dir")).default
    const directory = path.join(tmpDir, "gtfs-import")

    if (fs.existsSync(directory)) {
      await rimraf(directory)
    }

    fs.mkdirSync(directory)

    const outPath = path.join(directory, "gtfs.zip")

    this.logger.log("Downloading GTFS feed")

    let newLastModified: Date | null = null
    await axios({
      url,
      method: "get",
      responseType: "stream",
      responseEncoding: "binary",
    }).then((response) => {
      newLastModified = new Date(response.headers["last-modified"])
      const writer = fs.createWriteStream(outPath)

      return new Promise<void>((resolve, reject) => {
        response.data.pipe(writer)

        let error: any = null
        writer.on("error", (err) => {
          error = err
          writer.close()
          reject(err)
        })

        writer.on("close", () => {
          if (!error) {
            resolve()
          }
        })
      })
    })

    this.logger.log("Unzipping GTFS feed")
    const zipFile = await unzipper.Open.file(outPath)
    const zipDirectory = path.join(directory, "gtfs")
    await zipFile.extract({ path: zipDirectory })

    this.logger.log("Importing GTFS feed")
    await this.importFromDirectory(feedCode, zipDirectory)

    this.logger.log("Updating import metadata")
    await this.db.transaction().execute(async (tx) => {
      await sql`SET LOCAL app.current_feed = '${sql.raw(feedCode)}';`.execute(
        tx,
      )

      await tx.deleteFrom("import_metadata").execute()

      await tx
        .insertInto("import_metadata")
        .values({ last_modified: newLastModified, feed_code: feedCode })
        .execute()
    })

    this.logger.log("Cleaning up")
    await rimraf(directory)
  }

  async importFromDirectory(feedCode: string, directory: string) {
    await this.db
      .transaction()
      .setIsolationLevel("read committed")
      .execute(async (tx) => {
        await sql`SET LOCAL app.current_feed = '${sql.raw(feedCode)}';`.execute(
          tx,
        )

        await tx.deleteFrom("stop_times").execute()
        await tx.deleteFrom("trips").execute()
        await tx.deleteFrom("stops").execute()
        await tx.deleteFrom("routes").execute()
        await tx.deleteFrom("calendar_dates").execute()
        await tx.deleteFrom("calendar").execute()
        await tx.deleteFrom("agency").execute()
        await tx.deleteFrom("feed_info").execute()

        this.logger.log("Importing feed_info")
        await this.importFeedInfo(
          feedCode,
          tx,
          path.join(directory, "feed_info.txt"),
        )

        this.logger.log("Importing agency")
        await this.importAgency(
          feedCode,
          tx,
          path.join(directory, "agency.txt"),
        )

        this.logger.log("Importing calendar")
        await this.importCalendar(
          feedCode,
          tx,
          path.join(directory, "calendar.txt"),
        )

        this.logger.log("Importing calendar_dates")
        await this.importCalendarDates(
          feedCode,
          tx,
          path.join(directory, "calendar_dates.txt"),
        )

        this.logger.log("Importing routes")
        await this.importRoutes(
          feedCode,
          tx,
          path.join(directory, "routes.txt"),
        )

        this.logger.log("Importing stops")
        await this.importStops(feedCode, tx, path.join(directory, "stops.txt"))

        this.logger.log("Importing trips")
        await this.importTrips(feedCode, tx, path.join(directory, "trips.txt"))

        this.logger.log("Importing stop_times")
        await this.importStopTimes(
          feedCode,
          tx,
          path.join(directory, "stop_times.txt"),
        )
      })

    this.logger.log("Import done")
  }

  private importGtfsFile(
    tx: Transaction<DB>,
    tableName: string,
    filePath: string,
    mapRow: (row: any) => any,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const allRows = []
      fs.createReadStream(filePath)
        .pipe(csv.parse({ headers: true }))
        .on("error", reject)
        .on("data", async (row) => {
          allRows.push(mapRow(row))
        })
        .on("end", async () => {
          const batch = []
          for (let i = 0; i < allRows.length; i += 1000) {
            batch.push(allRows.slice(i, i + 1000))
          }

          for (const rows of batch) {
            await tx
              .insertInto(tableName as any)
              .values(rows)
              .execute()
          }

          resolve()
        })
    })
  }

  private importFeedInfo(
    feedCode: string,
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
      feed_code: feedCode,
    }))
  }

  private importAgency(
    feedCode: string,
    tx: Transaction<DB>,
    agencyPath: string,
  ): Promise<void> {
    return this.importGtfsFile(tx, "agency", agencyPath, (row) => ({
      agency_id: row.agency_id,
      agency_name: row.agency_name,
      agency_url: row.agency_url,
      agency_timezone: row.agency_timezone,
      agency_lang: row.agency_lang,
      agency_phone: row.agency_phone,
      agency_fare_url: row.agency_fare_url,
      agency_email: row.agency_email,
      feed_code: feedCode,
    }))
  }

  private importCalendar(
    feedCode: string,
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
      feed_code: feedCode,
    }))
  }

  private importCalendarDates(
    feedCode: string,
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
        feed_code: feedCode,
      }),
    )
  }

  private importRoutes(
    feedCode: string,
    tx: Transaction<DB>,
    routesPath: string,
  ): Promise<void> {
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
      feed_code: feedCode,
    }))
  }

  private importStops(
    feedCode: string,
    tx: Transaction<DB>,
    stopsPath: string,
  ): Promise<void> {
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
      feed_code: feedCode,
    }))
  }

  private importStopTimes(
    feedCode: string,
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
      feed_code: feedCode,
    }))
  }

  private importTrips(
    feedCode: string,
    tx: Transaction<DB>,
    tripsPath: string,
  ): Promise<void> {
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
      feed_code: feedCode,
    }))
  }
}
