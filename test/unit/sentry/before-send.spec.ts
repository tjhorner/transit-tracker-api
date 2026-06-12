import type { ErrorEvent, EventHint } from "@sentry/node"
import {
  InvalidGlobalIdError,
  StopNotFoundError,
} from "src/modules/feed/feed.errors"
import { annotateDomainErrorKind } from "src/sentry/before-send"

function annotate(event: ErrorEvent, originalException: unknown): ErrorEvent {
  return annotateDomainErrorKind(event, { originalException } as EventHint)
}

describe("annotateDomainErrorKind", () => {
  it("tags a domain error with its kind", () => {
    const event = annotate({} as ErrorEvent, new StopNotFoundError("st:1"))

    expect(event.tags).toMatchObject({ "domain.kind": "notFound" })
  })

  it("keeps any tags already on the event", () => {
    const event = annotate(
      { tags: { feedCode: "st" } } as unknown as ErrorEvent,
      new InvalidGlobalIdError("garbage"),
    )

    expect(event.tags).toEqual({
      feedCode: "st",
      "domain.kind": "invalidInput",
    })
  })

  it("leaves non-domain errors untouched", () => {
    const event = annotate({} as ErrorEvent, new Error("boom"))

    expect(event.tags).toBeUndefined()
  })
})
