import { z } from "zod"

export const FetchConfigSchema = z.strictObject({
  url: z.string(),
  headers: z.record(z.string()).optional(),
})

export const FetchConfigOrUrlSchema = z.union([
  FetchConfigSchema,
  z.string().transform((url) => ({ url, headers: {} })),
])

export const RouteIdFilteredFetchConfigSchema = FetchConfigSchema.extend({
  routeIds: z.array(z.string()).optional(),
})

export const GtfsConfigSchema = z.strictObject({
  quirks: z
    .object({
      fuzzyMatchTripUpdates: z.boolean().optional(),
    })
    .optional(),
  static: FetchConfigOrUrlSchema,
  rtTripUpdates: z
    .union([FetchConfigOrUrlSchema, z.array(RouteIdFilteredFetchConfigSchema)])
    .optional(),
})

export type FetchConfig = z.infer<typeof FetchConfigSchema>
export type GtfsConfig = z.infer<typeof GtfsConfigSchema>
