/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/upsert-import-metadata.sql" */
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
        { a: 82, b: 86 },
        { a: 171, b: 175 },
      ],
    },
    {
      name: "lastModified",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 89, b: 101 },
        { a: 196, b: 208 },
      ],
    },
    {
      name: "feedCode",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 104, b: 112 }],
    },
  ],
  statement:
    "INSERT INTO import_metadata (etag, last_modified, feed_code, imported_at)\nVALUES (:etag, :lastModified, :feedCode, now())\nON CONFLICT (feed_code) \nDO UPDATE SET \n  etag = :etag,\n  last_modified = :lastModified,\n  imported_at = now()",
}

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO import_metadata (etag, last_modified, feed_code, imported_at)
 * VALUES (:etag, :lastModified, :feedCode, now())
 * ON CONFLICT (feed_code)
 * DO UPDATE SET
 *   etag = :etag,
 *   last_modified = :lastModified,
 *   imported_at = now()
 * ```
 */
export const upsertImportMetadata = new PreparedQuery<
  IUpsertImportMetadataParams,
  IUpsertImportMetadataResult
>(upsertImportMetadataIR)
