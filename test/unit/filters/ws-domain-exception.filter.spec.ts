import { type ArgumentsHost } from "@nestjs/common"
import { BaseWsExceptionFilter } from "@nestjs/websockets"
import { WebSocketDomainExceptionFilter } from "src/filters/domain-exception.filter"
import { StopNotFoundError } from "src/modules/feed/feed.errors"

describe("WebSocketDomainExceptionFilter", () => {
  it("sends the error kind and message to the client", () => {
    const client = { send: vi.fn() }
    const host = {
      switchToWs: () => ({ getClient: () => client }),
    } as unknown as ArgumentsHost
    const baseCatch = vi
      .spyOn(BaseWsExceptionFilter.prototype, "catch")
      .mockImplementation(() => undefined)

    new WebSocketDomainExceptionFilter().catch(
      new StopNotFoundError("muni:1234"),
      host,
    )

    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({
        kind: "notFound",
        error: "Stop muni:1234 not found",
      }),
    )
    expect(baseCatch).toHaveBeenCalledOnce()

    baseCatch.mockRestore()
  })
})
