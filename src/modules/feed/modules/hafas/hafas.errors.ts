import { DomainError } from "../../../../errors/domain-error"
import { StopNotFoundError } from "../../feed.errors"

export type HafasErrorCode =
  | "ACCESS_DENIED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "SERVER_ERROR"

interface HafasError extends Error {
  isHafasError: true
  code: HafasErrorCode | null
}

export function isHafasError(error: unknown): error is HafasError {
  return (
    error instanceof Error &&
    (error as Partial<HafasError>).isHafasError === true
  )
}

export function toStopDomainError(
  error: unknown,
  stopId: string,
): DomainError | undefined {
  if (isHafasError(error) && error.code === "NOT_FOUND") {
    return new StopNotFoundError(stopId)
  }

  // Return undefined for errors that should bubble up unchanged (auth/server
  // failures are our problem, not the caller's)
  return undefined
}
