import { SetMetadata } from "@nestjs/common"

export const CACHE_QUERY_PARAMS_METADATA = "cache-query-params"

export const CacheQueryParams = (...queryParamNames: string[]) =>
  SetMetadata(CACHE_QUERY_PARAMS_METADATA, queryParamNames)
