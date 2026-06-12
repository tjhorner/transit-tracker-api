export type DomainErrorKind = "notFound" | "invalidInput"

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}
