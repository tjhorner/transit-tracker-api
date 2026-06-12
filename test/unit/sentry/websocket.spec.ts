import type { ErrorEvent } from "@sentry/node"
import { captureWsException, ConnectedClient } from "src/sentry/websocket"

const { mockScope, mockCaptureException } = vi.hoisted(() => ({
  mockScope: {
    setLevel: vi.fn(),
    setExtras: vi.fn(),
    setTag: vi.fn(),
    setUser: vi.fn(),
    addEventProcessor: vi.fn(),
  },
  mockCaptureException: vi.fn(),
}))

vi.mock("@sentry/node", () => ({
  withScope: (callback: (scope: typeof mockScope) => void) =>
    callback(mockScope),
  captureException: mockCaptureException,
}))

function makeClient(overrides: Partial<ConnectedClient> = {}): ConnectedClient {
  return {
    id: "client-1",
    ipAddress: "1.2.3.4",
    connectedAt: 0,
    requestUrl: "/?foo=bar",
    headers: {
      host: "api.example.com",
      "user-agent": "test-agent",
      "accept-language": ["en", "de"],
    },
    ...overrides,
  } as unknown as ConnectedClient
}

describe("captureWsException", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("captures the error with the client's IP and a websocket tag", () => {
    const error = new Error("boom")

    captureWsException(makeClient(), error)

    expect(mockScope.setUser).toHaveBeenCalledWith({
      ip_address: "1.2.3.4",
    })
    expect(mockScope.setTag).toHaveBeenCalledWith("transport", "websocket")
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it("populates the request context from the upgrade request", () => {
    captureWsException(makeClient(), new Error("boom"))

    const processor = mockScope.addEventProcessor.mock.calls[0][0]
    const event = processor({} as ErrorEvent)

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

  it("applies the level and extra when provided", () => {
    captureWsException(makeClient(), new Error("boom"), {
      level: "warning",
      extra: { retryCount: 3 },
    })

    expect(mockScope.setLevel).toHaveBeenCalledWith("warning")
    expect(mockScope.setExtras).toHaveBeenCalledWith({ retryCount: 3 })
  })
})
