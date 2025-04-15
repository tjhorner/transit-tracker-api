/**
 * This file has been adapted from @nestjs/cache-manager which is provided under the MIT License.
 */

import { ExecutionContext, SetMetadata } from "@nestjs/common"

export const CACHE_TTL_METADATA = "cache-ttl"

type CacheTTLFactory = (ctx: ExecutionContext) => Promise<number> | number
export const CacheTTL = (ttl: number | CacheTTLFactory) =>
  SetMetadata(CACHE_TTL_METADATA, ttl)
