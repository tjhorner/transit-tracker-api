/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/get-import-metadata.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetImportMetadata' parameters type */
export interface IGetImportMetadataParams {
  feedCode: string
}

/** 'GetImportMetadata' return type */
export interface IGetImportMetadataResult {
  etag: string | null
  hash: string | null
  imported_at: Date
  last_modified: Date | null
  max_stop_time_seconds: number | null
}

/** 'GetImportMetadata' query type */
export interface IGetImportMetadataQuery {
  params: IGetImportMetadataParams
  result: IGetImportMetadataResult
}

const getImportMetadataIR: any = {
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 164, b: 173 }],
    },
  ],
  statement:
    "SELECT\n  last_modified,\n  etag,\n  hash,\n  imported_at,\n  EXTRACT(EPOCH FROM max_stop_time)::int AS max_stop_time_seconds\nFROM\n  import_metadata\nWHERE\n  feed_code = :feedCode!",
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   last_modified,
 *   etag,
 *   hash,
 *   imported_at,
 *   EXTRACT(EPOCH FROM max_stop_time)::int AS max_stop_time_seconds
 * FROM
 *   import_metadata
 * WHERE
 *   feed_code = :feedCode!
 * ```
 */
export const getImportMetadata = new PreparedQuery<
  IGetImportMetadataParams,
  IGetImportMetadataResult
>(getImportMetadataIR)
