import { Module } from "@nestjs/common"
import { OneBusAwayService } from "./one-bus-away.service"

@Module({
  providers: [OneBusAwayService],
  exports: [OneBusAwayService],
})
export class OneBusAwayModule {}
