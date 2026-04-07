import { z } from "zod"

export const OneBusAwayConfigSchema = z.strictObject({
  baseUrl: z.string(),
  apiKey: z.string(),
  rateLimiter: z
    .object({
      enabled: z.boolean(),
      tokensPerInterval: z.number(),
      interval: z.number(),
    })
    .optional(),
})

export type OneBusAwayConfig = z.infer<typeof OneBusAwayConfigSchema>
