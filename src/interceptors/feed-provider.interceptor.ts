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
export class FeedProviderInterceptor implements NestInterceptor {
  constructor(private readonly feedService: FeedService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest()
    if (!req.params.feedCode) {
      req.feedProvider = this.feedService.all
      return next.handle()
    }

    const provider = this.feedService.getFeedProvider(req.params.feedCode)
    if (!provider) {
      throw new BadRequestException("Invalid feed code")
    }

    req.feedProvider = provider

    return next.handle()
  }
}
