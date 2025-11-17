/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/get-import-metadata.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetImportMetadata' parameters type */
export interface IGetImportMetadataParams {
  feedCode: string
}

/** 'GetImportMetadata' return type */
export interface IGetImportMetadataResult {
  etag: string | null
  imported_at: Date
  last_modified: Date | null
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
      locs: [{ a: 89, b: 98 }],
    },
  ],
  statement:
    "SELECT\n  last_modified,\n  etag,\n  imported_at\nFROM\n  import_metadata\nWHERE\n  feed_code = :feedCode!",
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   last_modified,
 *   etag,
 *   imported_at
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
