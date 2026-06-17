import type { ErrorEvent } from "@sentry/node"
import * as Sentry from "@sentry/node"
import {
  captureWsException,
  ConnectedClient,
  createConnectionScope,
} from "src/sentry/websocket"

const { mockWithIsolationScope, mockCaptureException } = vi.hoisted(() => ({
  mockWithIsolationScope: vi.fn((_scope: unknown, callback: () => void) =>
    callback(),
  ),
  mockCaptureException: vi.fn(),
}))

// Keep the real Scope (and its setUser/setTag/addEventProcessor), but stub the
// capture entry points so we can assert how they're invoked.
vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>()
  return {
    ...actual,
    withIsolationScope: mockWithIsolationScope,
    captureException: mockCaptureException,
  }
})

function connectionDetails(
  overrides: Partial<ConnectedClient> = {},
): Pick<ConnectedClient, "ipAddress" | "headers" | "requestUrl"> {
  return {
    ipAddress: "1.2.3.4",
    requestUrl: "/?foo=bar",
    headers: {
      host: "api.example.com",
      "user-agent": "test-agent",
      // @ts-expect-error bleh
      "accept-language": ["en", "de"],
    },
    ...overrides,
  }
}

describe("createConnectionScope", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("tags the scope as a websocket connection with the client IP", () => {
    const setUser = vi.spyOn(Sentry.Scope.prototype, "setUser")
    const setTag = vi.spyOn(Sentry.Scope.prototype, "setTag")

    createConnectionScope(connectionDetails())

    expect(setUser).toHaveBeenCalledWith({ ip_address: "1.2.3.4" })
    expect(setTag).toHaveBeenCalledWith("transport", "websocket")
  })

  it("parses the user agent and sets tags for known components", () => {
    const setTag = vi.spyOn(Sentry.Scope.prototype, "setTag")

    createConnectionScope(
      connectionDetails({
        headers: {
          "user-agent":
            "Eastside Urbanism.Transit Tracker/v3.2.1 ESPHome/2026.5.3 (ESP32-S3) esp-idf/5.5.4",
        },
      }),
    )

    expect(setTag).toHaveBeenCalledWith("device.project_version", "3.2.1")
    expect(setTag).toHaveBeenCalledWith("device.esphome_version", "2026.5.3")
    expect(setTag).toHaveBeenCalledWith("device.esp_idf_version", "5.5.4")
  })

  it.each(["TinyWebsockets Client", "ESP32 Websocket Client", "???", ""])(
    "doesn't fail if the user agent is unknown or malformed",
    (userAgent) => {
      expect(() =>
        createConnectionScope(
          connectionDetails({ headers: { "user-agent": userAgent } }),
        ),
      ).not.toThrow()
    },
  )

  it("populates the request context from the upgrade request", () => {
    const addEventProcessor = vi.spyOn(
      Sentry.Scope.prototype,
      "addEventProcessor",
    )

    createConnectionScope(connectionDetails())

    const processor = addEventProcessor.mock.calls[0][0]
    const event = processor({} as ErrorEvent, {}) as ErrorEvent
    expect(event.request).toEqual({
      method: "GET",
      url: "wss://api.example.com/?foo=bar",
      headers: {
        host: "api.example.com",
        "user-agent": "test-agent",
        "accept-language": "en, de",
      },
    })
  })

  it("gives each connection its own trace", () => {
    const first = createConnectionScope(connectionDetails())
    const second = createConnectionScope(connectionDetails())

    expect(first.getPropagationContext().traceId).not.toEqual(
      second.getPropagationContext().traceId,
    )
  })
})

describe("captureWsException", () => {
  const client = {
    sentryScope: { id: "connection-scope" },
  } as unknown as ConnectedClient

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("captures within the connection's isolation scope", () => {
    const error = new Error("boom")

    captureWsException(client, error)

    expect(mockWithIsolationScope).toHaveBeenCalledWith(
      client.sentryScope,
      expect.any(Function),
    )
    expect(mockCaptureException).toHaveBeenCalledWith(error, {})
  })

  it("passes through level and extra", () => {
    const error = new Error("boom")

    captureWsException(client, error, {
      level: "warning",
      extra: { retryCount: 3 },
    })

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      level: "warning",
      extra: { retryCount: 3 },
    })
  })
})
