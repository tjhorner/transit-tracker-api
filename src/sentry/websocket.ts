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
  sentryScope: Sentry.Scope
}

type WsConnectionDetails = Pick<
  ConnectedClient,
  "ipAddress" | "headers" | "requestUrl"
>

interface CaptureOptions {
  level?: Sentry.SeverityLevel
  extra?: Record<string, unknown>
}

interface UAVersion {
  name: string
  version: string
}

function parseUserAgent(ua: string): UAVersion[] {
  const pattern = /([\w][\w .-]*?)\/([\w.]+)(?:\s+\([^)]+\))?(?=\s+[\w]|$)/g
  const results: UAVersion[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(ua)) !== null) {
    results.push({ name: match[1].trim(), version: match[2] })
  }

  return results
}

function coalesceVersion(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version
}

const uaNameToTag = {
  "Eastside Urbanism.Transit Tracker": "project_version",
  ESPHome: "esphome_version",
  "esp-idf": "esp_idf_version",
} as const

export function createConnectionScope(
  connection: WsConnectionDetails,
): Sentry.Scope {
  const scope = new Sentry.Scope()
  scope.setTag("transport", "websocket")

  const deviceId = connection.headers["x-device-id"]
  scope.setUser({
    id: Array.isArray(deviceId) ? deviceId[0] : deviceId,
    ip_address: connection.ipAddress,
  })

  const userAgent = connection.headers["user-agent"]
  if (userAgent) {
    const uaVersions = parseUserAgent(userAgent)
    for (const { name, version } of uaVersions) {
      const tagName = uaNameToTag[name]
      if (!tagName) continue
      scope.setTag(`device.${tagName}`, coalesceVersion(version))
    }
  }

  scope.addEventProcessor((event) => {
    const host = connection.headers.host
    event.request = {
      ...event.request,
      method: "GET",
      url: host
        ? `wss://${host}${connection.requestUrl ?? ""}`
        : connection.requestUrl,
      headers: normalizeHeaders(connection.headers),
    }
    return event
  })
  return scope
}

export function captureWsException(
  client: ConnectedClient,
  error: unknown,
  options: CaptureOptions = {},
): void {
  // Re-enter the connection's isolation scope so the event carries that
  // connection's breadcrumbs, trace, and client/request context.
  Sentry.withIsolationScope(client.sentryScope, () => {
    Sentry.captureException(error, options)
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
