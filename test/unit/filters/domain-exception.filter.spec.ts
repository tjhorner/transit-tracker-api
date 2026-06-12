import {
  type ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import {
  DomainExceptionFilter,
  toHttpException,
} from "src/filters/domain-exception.filter"
import {
  FeedProviderNotFoundError,
  InvalidGlobalIdError,
  StopNotFoundError,
} from "src/modules/feed/feed.errors"

describe("toHttpException", () => {
  it("maps notFound errors to a 404 NotFoundException", () => {
    const result = toHttpException(new StopNotFoundError("muni:1234"))

    expect(result).toBeInstanceOf(NotFoundException)
    expect(result.getStatus()).toBe(404)
    expect(result.message).toBe("Stop muni:1234 not found")
  })

  it("maps invalidInput errors to a 400 BadRequestException", () => {
    const result = toHttpException(new InvalidGlobalIdError("nope"))

    expect(result).toBeInstanceOf(BadRequestException)
    expect(result.getStatus()).toBe(400)
    expect(result.message).toBe("Invalid global ID: nope")
  })

  it("preserves the original message in the response body", () => {
    const result = toHttpException(new FeedProviderNotFoundError("muni"))

    expect(result.getResponse()).toMatchObject({
      statusCode: 404,
      message: "No provider found for feed code muni",
    })
  })
})

describe("DomainExceptionFilter", () => {
  it("hands the mapped HttpException to the base filter for rendering", () => {
    const filter = new DomainExceptionFilter()
    const host = {} as ArgumentsHost
    const baseCatch = vi
      .spyOn(BaseExceptionFilter.prototype, "catch")
      .mockImplementation(() => undefined)

    filter.catch(new StopNotFoundError("muni:1234"), host)

    expect(baseCatch).toHaveBeenCalledOnce()
    const [forwarded, forwardedHost] = baseCatch.mock.calls[0]
    expect(forwarded).toBeInstanceOf(NotFoundException)
    expect((forwarded as NotFoundException).message).toBe(
      "Stop muni:1234 not found",
    )
    expect(forwardedHost).toBe(host)

    baseCatch.mockRestore()
  })
})
