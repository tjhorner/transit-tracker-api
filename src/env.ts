import ms from "ms"

export const env = {
  duration(key: string, fallbackMs: number): number {
    const value = process.env[key]
    return value ? ms(value as ms.StringValue) : fallbackMs
  },

  number(key: string, fallback: number): number {
    const value = process.env[key]
    return value === undefined ? fallback : Number(value)
  },
}
