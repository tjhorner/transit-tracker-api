import { DomainError } from "src/errors/domain-error"
import {
  FeedNotFoundError,
  FeedProviderNotFoundError,
  InvalidGlobalIdError,
  MismatchedFeedCodeError,
  StopNotFoundError,
} from "src/modules/feed/feed.errors"

describe("feed errors", () => {
  it("are DomainErrors so a single filter can catch them", () => {
    const errors = [
      new InvalidGlobalIdError("bad"),
      new MismatchedFeedCodeError("a:route", "b:stop"),
      new FeedNotFoundError("a"),
      new FeedProviderNotFoundError("a"),
      new StopNotFoundError("a:1"),
    ]

    for (const error of errors) {
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toBeInstanceOf(Error)
    }
  })

  it("sets the error name to the subclass name", () => {
    expect(new StopNotFoundError("a:1").name).toBe("StopNotFoundError")
  })

  it("classifies malformed input as invalidInput", () => {
    expect(new InvalidGlobalIdError("bad").kind).toBe("invalidInput")
    expect(new MismatchedFeedCodeError("a:r", "b:s").kind).toBe("invalidInput")
  })

  it("classifies missing resources as notFound", () => {
    expect(new FeedNotFoundError("a").kind).toBe("notFound")
    expect(new FeedProviderNotFoundError("a").kind).toBe("notFound")
    expect(new StopNotFoundError("a:1").kind).toBe("notFound")
  })

  it("builds messages from the fields it carries", () => {
    expect(new InvalidGlobalIdError("nope").message).toBe(
      "Invalid global ID: nope",
    )
    expect(new MismatchedFeedCodeError("a:route", "b:stop").message).toBe(
      "Route and stop IDs must have the same feed code: a:route and b:stop",
    )
    expect(new FeedNotFoundError("muni").message).toBe('Feed "muni" not found')
    expect(new FeedProviderNotFoundError("muni").message).toBe(
      "No provider found for feed code muni",
    )
    expect(new StopNotFoundError("muni:1234").message).toBe(
      "Stop muni:1234 not found",
    )
  })

  it("keeps the fields available for logging and tracing", () => {
    expect(new InvalidGlobalIdError("nope").globalId).toBe("nope")
    expect(new FeedProviderNotFoundError("muni").feedCode).toBe("muni")
    expect(new StopNotFoundError("muni:1234").stopId).toBe("muni:1234")

    const mismatch = new MismatchedFeedCodeError("a:route", "b:stop")
    expect(mismatch.routeId).toBe("a:route")
    expect(mismatch.stopId).toBe("b:stop")
  })
})
