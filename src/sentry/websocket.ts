import * as Sentry from "@sentry/node"
import type { IncomingHttpHeaders } from "http"

type WsConnectionDetails = {
  deviceId?: string
  ipAddress: string
  headers: IncomingHttpHeaders
  requestUrl?: string
  versions: {
    projectVersion?: string
    esphomeVersion?: string
    espIdfVersion?: string
  }
}

interface CaptureOptions {
  level?: Sentry.SeverityLevel
  extra?: Record<string, unknown>
}

export function createConnectionScope(
  connection: WsConnectionDetails,
): Sentry.Scope {
  const scope = new Sentry.Scope()
  scope.setTag("transport", "websocket")

  scope.setUser({
    id: connection.deviceId,
    ip_address: connection.ipAddress,
  })

  const { projectVersion, esphomeVersion, espIdfVersion } = connection.versions
  if (projectVersion) scope.setTag("device.project_version", projectVersion)
  if (esphomeVersion) scope.setTag("device.esphome_version", esphomeVersion)
  if (espIdfVersion) scope.setTag("device.esp_idf_version", espIdfVersion)

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
  client: { sentryScope: Sentry.Scope },
  error: unknown,
  options: CaptureOptions = {},
): void {
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
