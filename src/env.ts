import ms from "ms"

export const env = {
  string(key: string, fallback?: string): string | undefined {
    return process.env[key] ?? fallback
  },

  boolean(key: string, fallback = false): boolean {
    const value = process.env[key]
    return value === undefined ? fallback : value === "true"
  },

  int(key: string, fallback: number): number {
    const value = process.env[key]
    if (value === undefined) return fallback

    const parsed = Number(value)
    if (!Number.isInteger(parsed)) {
      throw new Error(
        `Environment variable ${key} must be an integer, got "${value}"`,
      )
    }
    return parsed
  },

  float(key: string, fallback: number): number {
    const value = process.env[key]
    if (value === undefined) return fallback

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `Environment variable ${key} must be a number, got "${value}"`,
      )
    }
    return parsed
  },

  duration(key: string, fallbackMs: number): number {
    const value = process.env[key]
    return value ? ms(value as ms.StringValue) : fallbackMs
  },

  list(key: string, separator = " "): string[] {
    const value = process.env[key]
    return value ? value.split(separator) : []
  },
}
