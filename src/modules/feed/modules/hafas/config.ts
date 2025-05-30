import { z } from "zod"

export const HafasConfigSchema = z.strictObject({
  userAgent: z.string(),
  profile: z.string(),
})

export type HafasConfig = z.infer<typeof HafasConfigSchema>
