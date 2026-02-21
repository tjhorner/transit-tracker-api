import { Inject, Injectable, Logger } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import * as csv from "fast-csv"
import * as fs from "fs"
import { tmpdir } from "node:os"
import { pipeline } from "node:stream/promises"
import * as path from "path"
import { PoolClient } from "pg"
import { from as copyFrom } from "pg-copy-streams"
import { rimraf } from "rimraf"
import type {
  FeedContext,
  SyncOptions,
} from "../../../interfaces/feed-provider.interface"
import type { GtfsConfig } from "../config"
import { GTFS_CONFIG } from "../const"
import { GTFS_TABLES, GtfsDbService } from "../gtfs-db.service"
import { SyncPostProcessor } from "./interface/sync-post-processor.interface"
import { InterpolateEmptyStopTimesPostProcessor } from "./postprocessors/interpolate-stop-times"
import { getImportMetadataCount } from "./queries/get-import-metadata-count.queries"
import { getImportMetadata } from "./queries/get-import-metadata.queries"
import { upsertImportMetadata } from "./queries/upsert-import-metadata.queries"
import { WebResourceMetadata, WebResourceService } from "./web-resource.service"
import { ZipFileService } from "./zip-file.service"

@Injectable()
export class GtfsSyncService {
  private readonly logger: Logger
  private readonly feedCode: string

  constructor(
    @Inject(REQUEST) { feedCode }: FeedContext<GtfsConfig>,
    @Inject(GTFS_CONFIG) private readonly config: GtfsConfig,
    private readonly webResourceService: WebResourceService,
    private readonly zipFileService: ZipFileService,
    private readonly db: GtfsDbService,
  ) {
    this.logger = new Logger(`${GtfsSyncService.name}[${feedCode}]`)
    this.feedCode = feedCode
  }

  async hasEverSynced() {
    const [{ count }] = await getImportMetadataCount.run(
      {
        feedCode: this.feedCode,
      },
      this.db,
    )
    return count > 0
  }

  private partitionOf(table: string) {
    return `${table}__${this.feedCode}`
  }

  private async createPartitions() {
    const conn = await this.db.obtainConnection()

    for (const table of GTFS_TABLES) {
      await conn.query(
        `CREATE TABLE IF NOT EXISTS ${this.partitionOf(table)} PARTITION OF ${table} FOR VALUES IN ('${this.feedCode}')`,
      )
    }

    conn.release()
  }

  private async isResourceNewer({
    lastModified,
    etag,
    hash,
  }: WebResourceMetadata) {
    const [currentImportMetadata] = await getImportMetadata.run(
      { feedCode: this.feedCode },
      this.db,
    )
    if (!currentImportMetadata) {
      return true
    }

    if (hash && currentImportMetadata.hash) {
      return hash !== currentImportMetadata.hash
    }

    if (lastModified) {
      return lastModified > (currentImportMetadata.last_modified ?? new Date(0))
    }

    if (etag) {
      return etag !== currentImportMetadata.etag
    }

    return true
  }

  async import(opts?: SyncOptions) {
    const url = this.config.static.url
    this.logger.log(
      `Starting import of feed "${this.feedCode}" from URL ${url}`,
    )

    try {
      await this.obtainSyncLock()
    } catch (e: any) {
      if (opts?.force) {
        this.logger.warn(
          `Could not obtain sync lock, but proceeding because force option was specified: ${e.message}`,
        )
      } else {
        throw e
      }
    }

    try {
      const resourceMetadata =
        await this.webResourceService.getResourceMetadata(
          url,
          this.config.static.headers,
        )

      this.logger.log(
        `GTFS zip metadata: lastModified=${resourceMetadata.lastModified?.toISOString() ?? "null"} etag=${resourceMetadata.etag ?? "null"} hash=${resourceMetadata.hash ?? "null"}`,
      )

      if (!opts?.force) {
        const isNewer = await this.isResourceNewer(resourceMetadata)
        if (!isNewer) {
          this.logger.log("Feed is not newer; import not required")
          return
        }
      }

      const directory = path.join(tmpdir(), "gtfs-import")

      if (fs.existsSync(directory)) {
        await rimraf(directory)
      }

      fs.mkdirSync(directory)

      const zipDirectory = path.join(directory, "gtfs")

      this.logger.log(`Downloading and unzipping GTFS feed to ${zipDirectory}`)

      await this.zipFileService.downloadAndExtract(
        this.config.static,
        zipDirectory,
      )

      await this.createPartitions()

      this.logger.log("Importing GTFS feed")
      await this.importFromDirectory(zipDirectory)

      this.logger.log("Updating import metadata")
      await upsertImportMetadata.run(
        {
          etag: resourceMetadata.etag,
          lastModified: resourceMetadata.lastModified,
          hash: resourceMetadata.hash,
          feedCode: this.feedCode,
        },
        this.db,
      )

      await this.runPostProcessors()

      this.logger.log("Cleaning up")
      await rimraf(directory)
    } finally {
      await this.releaseSyncLock()
    }
  }

  private async obtainSyncLock() {
    try {
      await this.db.query("INSERT INTO sync_lock (feed_code) VALUES ($1)", [
        this.feedCode,
      ])
    } catch (e: any) {
      throw new Error(
        `Could not obtain sync lock for feed ${this.feedCode}: ${e.message}`,
      )
    }
  }

  private async releaseSyncLock() {
    await this.db.query("DELETE FROM sync_lock WHERE feed_code = $1", [
      this.feedCode,
    ])
  }

  private async importFromDirectory(directory: string) {
    await this.db.tx(async (client) => {
      await client.query("SET LOCAL ROLE gtfs_import")

      for (const table of GTFS_TABLES) {
        this.logger.log(`Deleting existing data from ${table}`)
        await client.query(`TRUNCATE ONLY ${this.partitionOf(table)}`)
      }

      await this.importFeedInfo(client, path.join(directory, "feed_info.txt"))
      await this.importAgency(client, path.join(directory, "agency.txt"))
      await this.importCalendar(client, path.join(directory, "calendar.txt"))
      await this.importCalendarDates(
        client,
        path.join(directory, "calendar_dates.txt"),
      )
      await this.importRoutes(client, path.join(directory, "routes.txt"))
      await this.importStops(client, path.join(directory, "stops.txt"))
      await this.importTrips(client, path.join(directory, "trips.txt"))
      await this.importStopTimes(client, path.join(directory, "stop_times.txt"))
      await this.importFrequencies(
        client,
        path.join(directory, "frequencies.txt"),
      )

      this.logger.log("Committing changes to database")
    })

    this.logger.log("Import done")
  }

  private async runPostProcessors() {
    this.logger.log("Running post-processing tasks")

    const postProcessors: SyncPostProcessor[] = [
      new InterpolateEmptyStopTimesPostProcessor(),
    ]

    for (const processor of postProcessors) {
      this.logger.log(`Running ${processor.constructor.name}`)
      await processor.process(this.db, {
        feedCode: this.feedCode,
        config: this.config,
      })
    }
  }

  private flushEmptyStrings(row: any) {
    for (const key in row) {
      if (row[key] === "") {
        row[key] = null
      }
    }

    return row
  }

  private async importGtfsFile(
    client: PoolClient,
    tableName: string,
    filePath: string,
    mapRow: (row: any) => any,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Skipping ${path.basename(filePath)}; file not found`)
      return Promise.resolve()
    }

    this.logger.log(`Importing ${tableName}`)

    const outputRow = (row: any) =>
      this.flushEmptyStrings({
        feed_code: this.feedCode,
        ...mapRow(row),
      })

    if (process.env.GTFS_IMPORT_METHOD === "insert") {
      await this.importGtfsWithInsert(client, tableName, filePath, outputRow)
    } else {
      await this.importGtfsWithCopy(client, tableName, filePath, outputRow)
    }
  }

  private async importGtfsWithCopy(
    client: PoolClient,
    tableName: string,
    filePath: string,
    mapRow: (row: any) => any,
  ) {
    const columns = Object.keys(mapRow({}))
    const ingestStream = client.query(
      copyFrom(
        `COPY ${this.partitionOf(tableName)}(${columns.join(",")}) FROM STDIN (FORMAT csv, HEADER true)`,
      ),
    )

    const outputCsv = fs
      .createReadStream(filePath)
      .pipe(
        csv.parse({
          headers: true,
          ltrim: true,
          ignoreEmpty: true,
        }),
      )
      .pipe(
        csv.format({
          headers: true,
          transform: mapRow,
        }),
      )

    let importedRows = 0
    let lastLoggedCount = 0
    let lastLoggedAt = Date.now()
    const logStatus = () => {
      if (importedRows === lastLoggedCount) {
        return
      }

      const rate = Math.floor(
        (importedRows - lastLoggedCount) / ((Date.now() - lastLoggedAt) / 1000),
      )

      this.logger.log(
        `Imported ${importedRows.toLocaleString()} ${tableName} rows (${rate.toLocaleString()} rows/s)`,
      )

      lastLoggedCount = importedRows
      lastLoggedAt = Date.now()
    }

    let statusUpdateInterval: NodeJS.Timeout = setInterval(
      logStatus.bind(this),
      1000,
    )

    try {
      await pipeline(
        outputCsv,
        async function* (source) {
          for await (const chunk of source) {
            const rows = chunk.toString().split("\n").length - 1
            importedRows += rows
            yield chunk
          }
        },
        ingestStream,
      )

      logStatus()
    } finally {
      clearInterval(statusUpdateInterval)
    }
  }

  private async importGtfsWithInsert(
    client: PoolClient,
    tableName: string,
    filePath: string,
    mapRow: (row: any) => any,
  ) {
    const batchSize = process.env.GTFS_IMPORT_BATCH_SIZE
      ? parseInt(process.env.GTFS_IMPORT_BATCH_SIZE)
      : 5000

    if (isNaN(batchSize)) {
      throw new Error("GTFS_IMPORT_BATCH_SIZE must be a number")
    }

    let completedRows = 0
    const insertRows = async (rows: any[]) => {
      this.logger.log(
        `Inserting ${rows.length.toLocaleString()} ${tableName} rows ${completedRows.toLocaleString()} - ${(completedRows + rows.length).toLocaleString()}`,
      )

      for (const row of rows) {
        const columns = Object.keys(row)
        const values = columns.map((column) => row[column])
        await client.query(
          `INSERT INTO ${this.partitionOf(tableName)} (${columns.join(",")}) VALUES (${values
            .map((_, i) => `$${i + 1}`)
            .join(",")})`,
          values,
        )
      }

      completedRows += rows.length
    }

    const batch: any[] = []
    await pipeline(
      fs.createReadStream(filePath).pipe(
        csv.parse({
          headers: true,
          ltrim: true,
          ignoreEmpty: true,
        }),
      ),
      async (rows: AsyncIterable<any>) => {
        for await (const item of rows) {
          batch.push(mapRow(item))
          if (batch.length >= batchSize) {
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
    client: PoolClient,
    feedInfoPath: string,
  ): Promise<void> {
    return this.importGtfsFile(client, "feed_info", feedInfoPath, (row) => ({
      feed_publisher_name: row.feed_publisher_name,
      feed_publisher_url: row.feed_publisher_url,
      feed_lang: row.feed_lang,
      feed_start_date: row.feed_start_date,
      feed_end_date: row.feed_end_date,
      feed_version: row.feed_version,
    }))
  }

  private valueOrDefault<T>(value: T, defaultValue: string): T | string {
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    ) {
      return defaultValue
    }
    return value
  }

  private importAgency(client: PoolClient, agencyPath: string): Promise<void> {
    return this.importGtfsFile(client, "agency", agencyPath, (row) => ({
      agency_id: this.valueOrDefault(row.agency_id, "1"),
      agency_name: row.agency_name,
      agency_url: row.agency_url,
      agency_timezone: row.agency_timezone,
      agency_lang: row.agency_lang,
      agency_phone: row.agency_phone,
      agency_fare_url: row.agency_fare_url,
      agency_email: row.agency_email,
    }))
  }

  private importCalendar(
    client: PoolClient,
    calendarPath: string,
  ): Promise<void> {
    return this.importGtfsFile(client, "calendar", calendarPath, (row) => ({
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
    }))
  }

  private importCalendarDates(
    client: PoolClient,
    calendarDatesPath: string,
  ): Promise<void> {
    return this.importGtfsFile(
      client,
      "calendar_dates",
      calendarDatesPath,
      (row) => ({
        service_id: row.service_id,
        date: row.date,
        exception_type: row.exception_type,
      }),
    )
  }

  private async importRoutes(
    client: PoolClient,
    routesPath: string,
  ): Promise<void> {
    const {
      rows: [{ agency_id: defaultAgencyId }],
    } = await client.query(
      "SELECT agency_id FROM agency WHERE feed_code = $1 LIMIT 1",
      [this.feedCode],
    )

    return this.importGtfsFile(client, "routes", routesPath, (row) => ({
      route_id: row.route_id,
      agency_id: this.valueOrDefault(row.agency_id, defaultAgencyId),
      route_short_name: row.route_short_name,
      route_long_name: row.route_long_name,
      route_desc: row.route_desc,
      route_type: row.route_type,
      route_url: row.route_url,
      route_color: row.route_color,
      route_text_color: row.route_text_color,
    }))
  }

  private importStops(client: PoolClient, stopsPath: string): Promise<void> {
    return this.importGtfsFile(client, "stops", stopsPath, (row) => ({
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
    }))
  }

  private importStopTimes(
    client: PoolClient,
    stopTimesPath: string,
  ): Promise<void> {
    return this.importGtfsFile(client, "stop_times", stopTimesPath, (row) => ({
      trip_id: row.trip_id,
      arrival_time: row.arrival_time,
      departure_time: row.departure_time,
      stop_id: row.stop_id,
      stop_sequence: row.stop_sequence,
      stop_headsign: row.stop_headsign,
      pickup_type: row.pickup_type,
      drop_off_type: row.drop_off_type,
      shape_dist_traveled: row.shape_dist_traveled,
      timepoint: row.timepoint,
    }))
  }

  private importTrips(client: PoolClient, tripsPath: string): Promise<void> {
    return this.importGtfsFile(client, "trips", tripsPath, (row) => ({
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
    }))
  }

  private importFrequencies(
    client: PoolClient,
    frequenciesPath: string,
  ): Promise<void> {
    return this.importGtfsFile(
      client,
      "frequencies",
      frequenciesPath,
      (row) => ({
        trip_id: row.trip_id,
        start_time: row.start_time,
        end_time: row.end_time,
        headway_secs: row.headway_secs,
        exact_times: row.exact_times,
      }),
    )
  }
}
