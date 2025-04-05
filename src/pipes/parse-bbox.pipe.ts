import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  ParseArrayPipe,
} from "@nestjs/common"
import { BBox } from "geojson"

@Injectable()
export class ParseBboxPipe extends ParseArrayPipe {
  constructor() {
    super({
      items: Number,
      separator: ",",
      optional: false,
    })
  }

  async transform(value: any, metadata: ArgumentMetadata): Promise<BBox> {
    const array: number[] = await super.transform(value, metadata)
    if (array.length !== 4) {
      throw new BadRequestException(
        "Invalid bbox format, must be array of 4 numbers",
      )
    }

    return array as BBox
  }
}
