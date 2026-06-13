import type { ErrorEvent, EventHint } from "@sentry/node"
import { DomainError } from "../errors/domain-error"

export function annotateDomainErrorKind(
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent {
  const error = hint.originalException
  if (error instanceof DomainError) {
    event.tags = { ...event.tags, "domain.kind": error.kind }
    event.contexts = {
      ...event.contexts,
      domain: { kind: error.kind, ...error.context },
    }
  }

  return event
}
