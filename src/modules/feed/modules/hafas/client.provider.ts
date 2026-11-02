import { FactoryProvider, Logger } from "@nestjs/common"
import { createClient, HafasClient, Profile } from "hafas-client"
import ms from "ms"
import { FEED_CONTEXT } from "../../feed-context"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { HafasConfig } from "./config"

export const HAFAS_CLIENT = Symbol("HafasClient")

const HAFAS_REQUEST_TIMEOUT_MS = ms("10s")

// Used by hafas-client at runtime, but missing from its type definitions
type ProfileWithRequestHook = Profile & {
  transformReq?: (ctx: unknown, req: object) => object
}

export function withRequestTimeout(
  profile: ProfileWithRequestHook,
): ProfileWithRequestHook {
  return {
    ...profile,
    transformReq: (ctx, req) => {
      const reqWithTimeout = {
        ...req,
        signal: AbortSignal.timeout(HAFAS_REQUEST_TIMEOUT_MS),
      }

      return profile.transformReq
        ? profile.transformReq(ctx, reqWithTimeout)
        : reqWithTimeout
    },
  }
}

export const hafasClientProvider: FactoryProvider<HafasClient> = {
  provide: HAFAS_CLIENT,
  inject: [FEED_CONTEXT],
  useFactory: ({ feedCode, config }: FeedContext<HafasConfig>) => {
    new Logger(`HafasClientProvider[${feedCode}]`).log(
      `Initializing with HAFAS profile: ${config.profile}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { profile } = require(`hafas-client/p/${config.profile}`)
    return createClient(withRequestTimeout(profile), config.userAgent)
  },
}
