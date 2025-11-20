/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/upsert-import-metadata.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

export type DateOrString = Date | string

/** 'UpsertImportMetadata' parameters type */
export interface IUpsertImportMetadataParams {
  etag?: string | null | void
  feedCode?: string | null | void
  hash?: string | null | void
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
  usedParamSet: { etag: true, lastModified: true, hash: true, feedCode: true },
  params: [
    {
      name: "etag",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 90, b: 94 },
        { a: 185, b: 189 },
      ],
    },
    {
      name: "lastModified",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 97, b: 109 },
        { a: 210, b: 222 },
      ],
    },
    {
      name: "hash",
      required: false,
      transform: { type: "scalar" },
      locs: [
        { a: 112, b: 116 },
        { a: 234, b: 238 },
      ],
    },
    {
      name: "feedCode",
      required: false,
      transform: { type: "scalar" },
      locs: [{ a: 119, b: 127 }],
    },
  ],
  statement:
    'INSERT INTO "import_metadata" (etag, last_modified, hash, feed_code, imported_at)\nVALUES (:etag, :lastModified, :hash, :feedCode, now())\nON CONFLICT (feed_code) \nDO UPDATE SET\n  etag = :etag,\n  last_modified = :lastModified,\n  hash = :hash,\n  imported_at = now()',
}

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO "import_metadata" (etag, last_modified, hash, feed_code, imported_at)
 * VALUES (:etag, :lastModified, :hash, :feedCode, now())
 * ON CONFLICT (feed_code)
 * DO UPDATE SET
 *   etag = :etag,
 *   last_modified = :lastModified,
 *   hash = :hash,
 *   imported_at = now()
 * ```
 */
export const upsertImportMetadata = new PreparedQuery<
  IUpsertImportMetadataParams,
  IUpsertImportMetadataResult
>(upsertImportMetadataIR)
