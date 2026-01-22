import { z } from "zod"

export const MvgConfigSchema = z.strictObject({
  baseUrl: z.string().default("https://www.mvg.de/api/bgw-pt/v3"),
})

export type MvgConfig = z.infer<typeof MvgConfigSchema>
