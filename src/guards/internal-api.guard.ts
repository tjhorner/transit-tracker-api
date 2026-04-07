import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import type { Observable } from "rxjs"

@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest()
    const internalApiKey = process.env.INTERNAL_API_KEY

    if (!internalApiKey) {
      // If no internal API key is set, allow all requests (e.g., in development)
      return true
    }

    const authorizationHeader = request.headers["authorization"]
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return false
    }

    const requestApiKey = authorizationHeader.substring("Bearer ".length)
    return requestApiKey === internalApiKey
  }
}
