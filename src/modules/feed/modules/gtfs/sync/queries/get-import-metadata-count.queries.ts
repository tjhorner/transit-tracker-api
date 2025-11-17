/** Types generated for queries found in "src/modules/feed/modules/gtfs/sync/queries/get-import-metadata-count.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetImportMetadataCount' parameters type */
export interface IGetImportMetadataCountParams {
  feedCode: string
}

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
  usedParamSet: { feedCode: true },
  params: [
    {
      name: "feedCode",
      required: true,
      transform: { type: "scalar" },
      locs: [{ a: 86, b: 95 }],
    },
  ],
  statement:
    'SELECT\n  COUNT(feed_code)::int AS "count!"\nFROM\n  import_metadata\nWHERE\n  feed_code = :feedCode!',
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   COUNT(feed_code)::int AS "count!"
 * FROM
 *   import_metadata
 * WHERE
 *   feed_code = :feedCode!
 * ```
 */
export const getImportMetadataCount = new PreparedQuery<
  IGetImportMetadataCountParams,
  IGetImportMetadataCountResult
>(getImportMetadataCountIR)
