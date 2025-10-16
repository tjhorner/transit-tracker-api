import { ArgumentMetadata, BadRequestException } from "@nestjs/common"
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

  it("should handle integer values correctly", async () => {
    const value = "-122,37,-121,38"
    const result = await pipe.transform(value, metadata)

    const expected: BBox = [-122, 37, -121, 38]
    expect(result).toEqual(expected)
  })

  it("should handle decimal values correctly", async () => {
    const value = "-122.456,37.123,-121.789,38.456"
    const result = await pipe.transform(value, metadata)

    const expected: BBox = [-122.456, 37.123, -121.789, 38.456]
    expect(result).toEqual(expected)
  })

  it("should handle negative values correctly", async () => {
    const value = "-180,-90,180,90"
    const result = await pipe.transform(value, metadata)

    const expected: BBox = [-180, -90, 180, 90]
    expect(result).toEqual(expected)
  })

  it("should reject empty string input", async () => {
    const value = ""
    await expect(pipe.transform(value, metadata)).rejects.toThrow()
  })

  it("should throw BadRequestException when longitude is out of range", async () => {
    // Test minLon out of range (below -180)
    let value = "-190,37,-121,38"
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "minLon ([0]) must be between -180 and 180",
    )

    // Test maxLon out of range (above 180)
    value = "-122,37,190,38"
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "maxLon ([2]) must be between -180 and 180",
    )
  })

  it("should throw BadRequestException when latitude is out of range", async () => {
    // Test minLat out of range (below -90)
    let value = "-122,-95,-121,38"
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "minLat ([1]) must be between -90 and 90",
    )

    // Test maxLat out of range (above 90)
    value = "-122,37,-121,95"
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      BadRequestException,
    )
    await expect(pipe.transform(value, metadata)).rejects.toThrow(
      "maxLat ([3]) must be between -90 and 90",
    )
  })

  it("should accept boundary values for lat/lon ranges", async () => {
    // Test minimum boundary values
    let value = "-180,-90,-170,-80"
    expect(await pipe.transform(value, metadata)).toEqual([
      -180, -90, -170, -80,
    ])

    // Test maximum boundary values
    value = "170,80,180,90"
    expect(await pipe.transform(value, metadata)).toEqual([170, 80, 180, 90])
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
