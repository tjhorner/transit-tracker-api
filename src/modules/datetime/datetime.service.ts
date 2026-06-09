import { Injectable } from "@nestjs/common"

@Injectable()
export class DateTimeService {
  now(): Date {
    return new Date()
  }
}
