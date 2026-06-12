import { StopNotFoundError } from "src/modules/feed/feed.errors"
import {
  isHafasError,
  toStopDomainError,
} from "src/modules/feed/modules/hafas/hafas.errors"

function hafasError(code: string): Error {
  return Object.assign(new Error(code), { isHafasError: true, code })
}

describe("isHafasError", () => {
  it("recognizes errors marked by the hafas-client", () => {
    expect(isHafasError(hafasError("NOT_FOUND"))).toBe(true)
  })

  it("rejects plain errors and non-errors", () => {
    expect(isHafasError(new Error("nope"))).toBe(false)
    expect(isHafasError({ isHafasError: true })).toBe(false)
    expect(isHafasError(undefined)).toBe(false)
  })
})

describe("toStopDomainError", () => {
  it("translates a NOT_FOUND into a StopNotFoundError carrying the stop ID", () => {
    const result = toStopDomainError(hafasError("NOT_FOUND"), "stop-1")

    expect(result).toBeInstanceOf(StopNotFoundError)
    expect((result as StopNotFoundError).stopId).toBe("stop-1")
  })

  it("leaves auth and server failures to bubble up unchanged", () => {
    expect(
      toStopDomainError(hafasError("ACCESS_DENIED"), "stop-1"),
    ).toBeUndefined()
    expect(
      toStopDomainError(hafasError("SERVER_ERROR"), "stop-1"),
    ).toBeUndefined()
    expect(
      toStopDomainError(new Error("network down"), "stop-1"),
    ).toBeUndefined()
  })
})
