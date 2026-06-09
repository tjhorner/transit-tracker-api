import { Module } from "@nestjs/common"
import { DateTimeService } from "./datetime.service"

@Module({
  providers: [DateTimeService],
  exports: [DateTimeService],
})
export class DateTimeModule {}
