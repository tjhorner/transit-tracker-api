import { createParamDecorator, ExecutionContext } from "@nestjs/common"

export const ScheduleProviderParam = createParamDecorator(
  (_: never, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    return request.scheduleProvider
  },
)
