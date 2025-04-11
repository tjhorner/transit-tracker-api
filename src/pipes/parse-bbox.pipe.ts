import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  ParseArrayPipe,
} from "@nestjs/common"
import { BBox } from "geojson"

const LAT_RANGE = [-90, 90] as const
const LON_RANGE = [-180, 180] as const

@Injectable()
export class ParseBboxPipe extends ParseArrayPipe {
  constructor() {
    super({
      items: Number,
      separator: ",",
      optional: false,
    })
  }

  private validateInRange(
    value: number,
    [min, max]: readonly [number, number],
    name: string,
  ): void {
    if (value < min || value > max) {
      throw new BadRequestException(`${name} must be between ${min} and ${max}`)
    }
  }

  async transform(value: any, metadata: ArgumentMetadata): Promise<BBox> {
    const array: number[] = await super.transform(value, metadata)
    if (array.length !== 4) {
      throw new BadRequestException(
        "Invalid bbox format, must be array of 4 numbers",
      )
    }

    const [minLon, minLat, maxLon, maxLat] = array
    this.validateInRange(minLon, LON_RANGE, "minLon ([0])")
    this.validateInRange(minLat, LAT_RANGE, "minLat ([1])")
    this.validateInRange(maxLon, LON_RANGE, "maxLon ([2])")
    this.validateInRange(maxLat, LAT_RANGE, "maxLat ([3])")

    return array as BBox
  }
}
