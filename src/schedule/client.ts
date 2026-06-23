import type * as Sentry from "@sentry/nestjs"
import { UUID } from "crypto"
import type { IncomingHttpHeaders } from "http"
import { WebSocket } from "ws"

export interface ClientVersions {
  projectVersion?: string
  esphomeVersion?: string
  espIdfVersion?: string
}

export type ConnectedClient = WebSocket & {
  sessionId: UUID
  deviceId?: string
  ipAddress: string
  connectedAt: number
  headers: IncomingHttpHeaders
  requestUrl?: string
  sentryScope: Sentry.Scope
  versions: ClientVersions
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

export function parseClientVersions(ua: string): ClientVersions {
  const versions: ClientVersions = {}
  for (const { name, version } of parseUserAgent(ua)) {
    switch (name) {
      case "Eastside Urbanism.Transit Tracker":
        versions.projectVersion = coalesceVersion(version)
        break
      case "ESPHome":
        versions.esphomeVersion = coalesceVersion(version)
        break
      case "esp-idf":
        versions.espIdfVersion = coalesceVersion(version)
        break
    }
  }
  return versions
}
