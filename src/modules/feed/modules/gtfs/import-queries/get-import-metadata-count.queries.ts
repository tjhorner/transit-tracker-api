/** Types generated for queries found in "src/modules/feed/modules/gtfs/import-queries/get-import-metadata-count.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetImportMetadataCount' parameters type */
export type IGetImportMetadataCountParams = void

/** 'GetImportMetadataCount' return type */
export interface IGetImportMetadataCountResult {
  count: number
}

/** 'GetImportMetadataCount' query type */
export interface IGetImportMetadataCountQuery {
  params: IGetImportMetadataCountParams
  result: IGetImportMetadataCountResult
}

const getImportMetadataCountIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    'SELECT\n  COUNT(feed_code)::int AS "count!"\nFROM\n  import_metadata',
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   COUNT(feed_code)::int AS "count!"
 * FROM
 *   import_metadata
 * ```
 */
export const getImportMetadataCount = new PreparedQuery<
  IGetImportMetadataCountParams,
  IGetImportMetadataCountResult
>(getImportMetadataCountIR)
