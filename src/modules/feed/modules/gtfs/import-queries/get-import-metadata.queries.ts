/** Types generated for queries found in "src/modules/feed/modules/gtfs/import-queries/get-import-metadata.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetImportMetadata' parameters type */
export type IGetImportMetadataParams = void

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
  usedParamSet: {},
  params: [],
  statement:
    "SELECT\n  last_modified,\n  etag,\n  imported_at\nFROM\n  import_metadata",
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
 * ```
 */
export const getImportMetadata = new PreparedQuery<
  IGetImportMetadataParams,
  IGetImportMetadataResult
>(getImportMetadataIR)
