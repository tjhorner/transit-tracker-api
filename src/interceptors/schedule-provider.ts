import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import { Observable } from "rxjs"
import { FeedService } from "src/modules/feed/feed.service"

@Injectable()
export class ScheduleProviderInterceptor implements NestInterceptor {
  constructor(private readonly feedService: FeedService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest()
    if (!req.params.feedCode) {
      throw new BadRequestException("Missing feedCode parameter")
    }

    const provider = this.feedService.getScheduleProvider(req.params.feedCode)
    if (!provider) {
      throw new BadRequestException("Invalid feed code")
    }

    req.scheduleProvider = provider

    return next.handle()
  }
}
