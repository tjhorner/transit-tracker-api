import { env } from "src/env"

const KEY = "ENV_TEST_VALUE"

describe("env", () => {
  afterEach(() => {
    delete process.env[KEY]
  })

  describe("string", () => {
    it("returns the value when set", () => {
      process.env[KEY] = "hello"
      expect(env.string(KEY)).toBe("hello")
    })

    it("returns undefined when unset and no fallback is given", () => {
      expect(env.string(KEY)).toBeUndefined()
    })

    it("returns the fallback when unset", () => {
      expect(env.string(KEY, "fallback")).toBe("fallback")
    })

    it("prefers the value over the fallback", () => {
      process.env[KEY] = "set"
      expect(env.string(KEY, "fallback")).toBe("set")
    })
  })

  describe("boolean", () => {
    it('returns true only for the literal "true"', () => {
      process.env[KEY] = "true"
      expect(env.boolean(KEY)).toBe(true)
    })

    it("returns false for any other value", () => {
      process.env[KEY] = "false"
      expect(env.boolean(KEY)).toBe(false)

      process.env[KEY] = "1"
      expect(env.boolean(KEY)).toBe(false)
    })

    it("returns false by default when unset", () => {
      expect(env.boolean(KEY)).toBe(false)
    })

    it("returns the fallback when unset", () => {
      expect(env.boolean(KEY, true)).toBe(true)
    })
  })

  describe("int", () => {
    it("parses an integer value", () => {
      process.env[KEY] = "42"
      expect(env.int(KEY, 0)).toBe(42)
    })

    it("returns the fallback when unset", () => {
      expect(env.int(KEY, 1000)).toBe(1000)
    })

    it("throws when the value is a float", () => {
      process.env[KEY] = "10.5"
      expect(() => env.int(KEY, 0)).toThrow(/must be an integer/)
    })

    it("throws when the value is not a number", () => {
      process.env[KEY] = "abc"
      expect(() => env.int(KEY, 0)).toThrow(/must be an integer/)
    })
  })

  describe("float", () => {
    it("parses a float value", () => {
      process.env[KEY] = "0.15"
      expect(env.float(KEY, 0)).toBe(0.15)
    })

    it("parses an integer value", () => {
      process.env[KEY] = "1"
      expect(env.float(KEY, 0)).toBe(1)
    })

    it("returns the fallback when unset", () => {
      expect(env.float(KEY, 0.5)).toBe(0.5)
    })

    it("throws when the value is not a number", () => {
      process.env[KEY] = "abc"
      expect(() => env.float(KEY, 0)).toThrow(/must be a number/)
    })
  })

  describe("duration", () => {
    it("parses a duration string into milliseconds", () => {
      process.env[KEY] = "1s"
      expect(env.duration(KEY, 0)).toBe(1000)
    })

    it("returns the fallback when unset", () => {
      expect(env.duration(KEY, 5000)).toBe(5000)
    })
  })

  describe("list", () => {
    it("splits on the default space separator", () => {
      process.env[KEY] = "a b c"
      expect(env.list(KEY)).toEqual(["a", "b", "c"])
    })

    it("splits on a custom separator", () => {
      process.env[KEY] = "a,b,c"
      expect(env.list(KEY, ",")).toEqual(["a", "b", "c"])
    })

    it("returns an empty array when unset", () => {
      expect(env.list(KEY)).toEqual([])
    })
  })
})
