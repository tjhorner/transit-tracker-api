/** Types generated for queries found in "src/modules/feed/modules/gtfs/import-queries/upsert-import-metadata.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

export type DateOrString = Date | string

/** 'UpsertImportMetadata' parameters type */
export interface IUpsertImportMetadataParams {
  etag?: string | null | void
  feedCode?: string | null | void
  lastModified?: DateOrString | null | void
}

/** 'UpsertImportMetadata' return type */
export type IUpsertImportMetadataResult = void

/** 'UpsertImportMetadata' query type */
export interface IUpsertImportMetadataQuery {
  params: IUpsertImportMetadataParams
  result: IUpsertImportMetadataResult
}

const upsertImportMetadataIR: any = {
  usedParamSet: { etag: true, lastModified: true, feedCode: true },
  params: [
    {
      name: "etag",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 69, b: 73 },
        { a: 151, b: 155 },
      ],
    },
    {
      name: "lastModified",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 76, b: 88 },
        { a: 176, b: 188 },
      ],
    },
    {
      name: "feedCode",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 91, b: 99 }],
    },
  ],
  statement:
    "INSERT INTO import_metadata (etag, last_modified, feed_code)\nVALUES (:etag, :lastModified, :feedCode)\nON CONFLICT (feed_code) \nDO UPDATE SET \n  etag = :etag,\n  last_modified = :lastModified",
}

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO import_metadata (etag, last_modified, feed_code)
 * VALUES (:etag, :lastModified, :feedCode)
 * ON CONFLICT (feed_code)
 * DO UPDATE SET
 *   etag = :etag,
 *   last_modified = :lastModified
 * ```
 */
export const upsertImportMetadata = new PreparedQuery<
  IUpsertImportMetadataParams,
  IUpsertImportMetadataResult
>(upsertImportMetadataIR)
