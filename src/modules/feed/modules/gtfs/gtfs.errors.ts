import { DomainError } from "../../../../errors/domain-error"

export class UpstreamHttpError extends DomainError {
  readonly kind = "upstream"

  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`HTTP ${status} ${statusText} for ${method} ${url}`, {
      method,
      url,
      status,
      statusText,
    })
  }
}

export class EmptyResponseBodyError extends DomainError {
  readonly kind = "upstream"

  constructor() {
    super("Response body is null")
  }
}

export class FeedValidationError extends DomainError {
  readonly kind = "upstream"

  constructor(readonly errors: string[]) {
    super(
      `GTFS feed validation failed with errors: ${errors.join(", ").trim()}`,
      { errors },
    )
  }
}

export class SyncLockError extends DomainError {
  readonly kind = "unavailable"

  constructor(
    readonly feedCode: string,
    readonly reason: string,
  ) {
    super(`Could not obtain sync lock for feed ${feedCode}: ${reason}`, {
      feedCode,
      reason,
    })
  }
}

export class FeedNeverSyncedError extends DomainError {
  readonly kind = "unavailable"

  constructor(readonly feedCode: string) {
    super(`Feed "${feedCode}" has never been synced`, { feedCode })
  }
}
