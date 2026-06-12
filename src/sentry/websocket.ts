import * as Sentry from "@sentry/node"
import type { UUID } from "crypto"
import type { IncomingHttpHeaders } from "http"
import type { WebSocket as BaseWebSocket } from "ws"

export type ConnectedClient = BaseWebSocket & {
  id: UUID
  ipAddress: string
  connectedAt: number
  headers: IncomingHttpHeaders
  requestUrl?: string
}

interface CaptureOptions {
  level?: Sentry.SeverityLevel
  extra?: Record<string, unknown>
}

// WebSocket events have no HTTP request context, so Sentry can't attach the
// client info it normally would. This adds it from the connection's upgrade
// request, mirroring what the HTTP integration provides.
export function captureWsException(
  client: ConnectedClient,
  error: unknown,
  options: CaptureOptions = {},
): void {
  Sentry.withScope((scope) => {
    if (options.level) {
      scope.setLevel(options.level)
    }

    if (options.extra) {
      scope.setExtras(options.extra)
    }

    scope.setTag("transport", "websocket")
    scope.setUser({ ip_address: client.ipAddress })
    scope.addEventProcessor((event) => {
      const host = client.headers.host
      event.request = {
        ...event.request,
        method: "GET",
        url: host
          ? `wss://${host}${client.requestUrl ?? ""}`
          : client.requestUrl,
        headers: normalizeHeaders(client.headers),
      }
      return event
    })

    Sentry.captureException(error)
  })
}

function normalizeHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue
    }
    normalized[key] = Array.isArray(value) ? value.join(", ") : value
  }
  return normalized
}
