import { DomainError } from "../../errors/domain-error"

export class InvalidGlobalIdError extends DomainError {
  readonly kind = "invalidInput"

  constructor(readonly globalId: string) {
    super(`Invalid global ID: ${globalId}`)
  }
}

export class MismatchedFeedCodeError extends DomainError {
  readonly kind = "invalidInput"

  constructor(
    readonly routeId: string,
    readonly stopId: string,
  ) {
    super(
      `Route and stop IDs must have the same feed code: ${routeId} and ${stopId}`,
    )
  }
}

export class FeedNotFoundError extends DomainError {
  readonly kind = "notFound"

  constructor(readonly feedCode: string) {
    super(`Feed "${feedCode}" not found`)
  }
}

export class FeedProviderNotFoundError extends DomainError {
  readonly kind = "notFound"

  constructor(readonly feedCode: string) {
    super(`No provider found for feed code ${feedCode}`)
  }
}

export class StopNotFoundError extends DomainError {
  readonly kind = "notFound"

  constructor(readonly stopId: string) {
    super(`Stop ${stopId} not found`)
  }
}
