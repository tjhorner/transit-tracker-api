import { createParamDecorator, ExecutionContext } from "@nestjs/common"

export const InjectFeedProvider = createParamDecorator(
  (_: never, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    return request.feedProvider
  },
)
