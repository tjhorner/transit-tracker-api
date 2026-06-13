export type DomainErrorKind =
  | "notFound" // 404
  | "invalidInput" // 400
  | "upstream" // 502
  | "unavailable" // 503
  | "configuration" // 500
  | "notImplemented" // 501

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind

  constructor(
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = new.target.name
  }
}
