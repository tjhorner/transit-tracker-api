import { ArgumentMetadata, BadRequestException } from "@nestjs/common"
import * as fc from "fast-check"
import { BBox } from "geojson"
import { ParseBboxPipe } from "src/pipes/parse-bbox.pipe"

describe("ParseBboxPipe", () => {
  let pipe: ParseBboxPipe
  const metadata: ArgumentMetadata = {
    type: "query",
    metatype: Array,
    data: "bbox",
  }

  beforeEach(() => {
    pipe = new ParseBboxPipe()
  })

  it("should transform a string with four numbers into a BBox", async () => {
    const value = "-122.4,37.6,-122.3,37.7"
    const result = await pipe.transform(value, metadata)

    const expected: BBox = [-122.4, 37.6, -122.3, 37.7]
    expect(result).toEqual(expected)
  })

  it("should parse any valid lon/lat values back to their original numbers", async () => {
    // -0 stringifies to "0" so the round-trip breaks; exclude it
    const lon = fc
      .double({ min: -180, max: 180, noNaN: true })
      .filter((n) => !Object.is(n, -0))
    const lat = fc
      .double({ min: -90, max: 90, noNaN: true })
      .filter((n) => !Object.is(n, -0))

    await fc.assert(
      fc.asyncProperty(
        lon,
        lat,
        lon,
        lat,
        async (minLon, minLat, maxLon, maxLat) => {
          const input = `${minLon},${minLat},${maxLon},${maxLat}`
          const result = await pipe.transform(input, metadata)
          expect(result).toEqual([minLon, minLat, maxLon, maxLat])
        },
      ),
    )
  })

  it("should throw BadRequestException when input has fewer than 4 numbers", async () => {
    const value = "-122.4,37.6,-122.3"

    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "Invalid bbox format, must be array of 4 numbers",
    )
  })

  it("should throw BadRequestException when input has more than 4 numbers", async () => {
    const value = "-122.4,37.6,-122.3,37.7,42.0"

    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "Invalid bbox format, must be array of 4 numbers",
    )
  })

  it("should throw BadRequestException when input contains non-numeric values", async () => {
    const value = "-122.4,invalid,-122.3,37.7"

    await expect(pipe.transform(value, metadata)).rejects.toThrow()
  })

  it("should throw BadRequestException for any longitude out of range", async () => {
    const outOfRangeLon = fc.oneof(
      fc.double({ max: -180.01, noNaN: true }),
      fc.double({ min: 180.01, noNaN: true }),
    )
    const validLat = fc.double({ min: -90, max: 90, noNaN: true })

    await fc.assert(
      fc.asyncProperty(outOfRangeLon, validLat, async (badLon, lat) => {
        const minLonOut = `${badLon},${lat},0,0`
        await expect(pipe.transform(minLonOut, metadata)).rejects.toThrow(
          BadRequestException,
        )
        const maxLonOut = `0,0,${badLon},${lat}`
        await expect(pipe.transform(maxLonOut, metadata)).rejects.toThrow(
          BadRequestException,
        )
      }),
    )
  })

  it("should throw BadRequestException for any latitude out of range", async () => {
    const validLon = fc.double({ min: -180, max: 180, noNaN: true })
    const outOfRangeLat = fc.oneof(
      fc.double({ max: -90.01, noNaN: true }),
      fc.double({ min: 90.01, noNaN: true }),
    )

    await fc.assert(
      fc.asyncProperty(validLon, outOfRangeLat, async (lon, badLat) => {
        const minLatOut = `${lon},${badLat},0,0`
        await expect(pipe.transform(minLatOut, metadata)).rejects.toThrow(
          BadRequestException,
        )
        const maxLatOut = `0,0,${lon},${badLat}`
        await expect(pipe.transform(maxLatOut, metadata)).rejects.toThrow(
          BadRequestException,
        )
      }),
    )
  })

  it("should reject empty string input", async () => {
    const value = ""
    await expect(pipe.transform(value, metadata)).rejects.toThrow()
  })

  it("should reject null input", async () => {
    const value = null
    await expect(pipe.transform(value, metadata)).rejects.toThrow()
  })

  it("should reject undefined input", async () => {
    const value = undefined
    await expect(pipe.transform(value, metadata)).rejects.toThrow()
  })
})
