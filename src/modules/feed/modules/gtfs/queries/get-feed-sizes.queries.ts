/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/get-feed-sizes.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetFeedSizes' parameters type */
export type IGetFeedSizesParams = void

/** 'GetFeedSizes' return type */
export interface IGetFeedSizesResult {
  feed_code: string
  size_kb: number
  table_name: string
}

/** 'GetFeedSizes' query type */
export interface IGetFeedSizesQuery {
  params: IGetFeedSizesParams
  result: IGetFeedSizesResult
}

const getFeedSizesIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    'select\n  split_part(inf.table_name, \'__\', 1) as "table_name!",\n  split_part(inf.table_name, \'__\', 2) as "feed_code!",\n  (pg_total_relation_size(quote_ident(table_name)) / 1000)::int as "size_kb!"\nfrom\n  information_schema.tables inf\nwhere\n  table_name like \'%\\_\\_%\'\norder by\n  "size_kb!" desc',
}

/**
 * Query generated from SQL:
 * ```
 * select
 *   split_part(inf.table_name, '__', 1) as "table_name!",
 *   split_part(inf.table_name, '__', 2) as "feed_code!",
 *   (pg_total_relation_size(quote_ident(table_name)) / 1000)::int as "size_kb!"
 * from
 *   information_schema.tables inf
 * where
 *   table_name like '%\_\_%'
 * order by
 *   "size_kb!" desc
 * ```
 */
export const getFeedSizes = new PreparedQuery<
  IGetFeedSizesParams,
  IGetFeedSizesResult
>(getFeedSizesIR)
