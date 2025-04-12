import { z } from "zod"

export const OneBusAwayConfigSchema = z.strictObject({
  baseUrl: z.string(),
  apiKey: z.string(),
})

export type OneBusAwayConfig = z.infer<typeof OneBusAwayConfigSchema>
