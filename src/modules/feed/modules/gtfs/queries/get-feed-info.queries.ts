/** Types generated for queries found in "src/modules/feed/modules/gtfs/queries/get-feed-info.sql" */
import { PreparedQuery } from "@pgtyped/runtime"

/** 'GetFeedInfo' parameters type */
export type IGetFeedInfoParams = void

/** 'GetFeedInfo' return type */
export interface IGetFeedInfoResult {
  feed_end_date: Date | null
  feed_lang: string | null
  feed_publisher_name: string | null
  feed_publisher_url: string | null
  feed_start_date: Date | null
  feed_version: string | null
}

/** 'GetFeedInfo' query type */
export interface IGetFeedInfoQuery {
  params: IGetFeedInfoParams
  result: IGetFeedInfoResult
}

const getFeedInfoIR: any = {
  usedParamSet: {},
  params: [],
  statement:
    'SELECT\n  feed_publisher_name,\n  feed_publisher_url,\n  feed_lang,\n  feed_start_date,\n  feed_end_date,\n  feed_version\nFROM "feed_info"\nLIMIT 1',
}

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   feed_publisher_name,
 *   feed_publisher_url,
 *   feed_lang,
 *   feed_start_date,
 *   feed_end_date,
 *   feed_version
 * FROM "feed_info"
 * LIMIT 1
 * ```
 */
export const getFeedInfo = new PreparedQuery<
  IGetFeedInfoParams,
  IGetFeedInfoResult
>(getFeedInfoIR)
