import type * as Sentry from "@sentry/nestjs"
import { UUID } from "crypto"
import type { IncomingHttpHeaders } from "http"
import type { Store } from "nestjs-pino/storage"
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
  logStore?: Store
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

  // we know some firmware version ranges based on heuristics
  // (switched from tinywebsockets to native esp32 websocket client in 3.0.0, then
  // started reporting UA versions in 3.0.3)
  switch (ua) {
    case "TinyWebsockets Client":
      versions.projectVersion = "<3.0.0"
      return versions
    case "ESP32 Websocket Client":
      versions.projectVersion = "3.0.0-3.0.2"
      return versions
  }

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
