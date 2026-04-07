import { z } from "zod"

export const OneBusAwayConfigSchema = z.strictObject({
  baseUrl: z.string(),
  apiKey: z.string(),
  rateLimiter: z
    .object({
      enabled: z.boolean().default(true),
      tokensPerInterval: z.number().default(1),
      interval: z.number().default(200),
    })
    .default({}),
})

export type OneBusAwayConfig = z.infer<typeof OneBusAwayConfigSchema>
