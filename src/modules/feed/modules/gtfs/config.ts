import { z } from "zod"

export const FetchConfigSchema = z.strictObject({
  url: z.string(),
  headers: z.record(z.string()).optional(),
})

export const GtfsConfigSchema = z.strictObject({
  static: FetchConfigSchema,
  rtTripUpdates: z
    .union([FetchConfigSchema, z.array(FetchConfigSchema)])
    .optional(),
})

export type FetchConfig = z.infer<typeof FetchConfigSchema>
export type GtfsConfig = z.infer<typeof GtfsConfigSchema>
