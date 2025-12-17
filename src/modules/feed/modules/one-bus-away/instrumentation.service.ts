import { Inject, Injectable } from "@nestjs/common"
import { REQUEST } from "@nestjs/core"
import { Counter, Histogram, ValueType } from "@opentelemetry/api"
import * as Sentry from "@sentry/node"
import { RateLimiter } from "limiter"
import { MetricService } from "nestjs-otel"
import type { FeedContext } from "../../interfaces/feed-provider.interface"
import { OneBusAwayConfig } from "./config"

@Injectable()
export class OneBusAwayInstrumentationService {
  private feedCode: string
  private obaRequestCounter: Counter
  private obaResponseCounter: Counter
  private obaRequestDuration: Histogram
  private obaRateLimiter = new RateLimiter({
    tokensPerInterval: 1,
    interval: 200,
  })

  constructor(
    @Inject(REQUEST) { feedCode }: FeedContext<OneBusAwayConfig>,
    metricService: MetricService,
  ) {
    this.feedCode = feedCode

    this.obaRequestCounter = metricService.getCounter(
      "onebusaway_request_count",
      {
        description: "Number of requests made to the OneBusAway API",
        unit: "requests",
      },
    )

    this.obaResponseCounter = metricService.getCounter(
      "onebusaway_response_count",
      {
        description: "Number of responses received from the OneBusAway API",
        unit: "responses",
      },
    )

    this.obaRequestDuration = metricService.getHistogram(
      "onebusaway_request_duration",
      {
        description: "Duration of requests made to the OneBusAway API",
        unit: "ms",
        valueType: ValueType.DOUBLE,
      },
    )
  }

  async fetch(url: any, init?: any): Promise<any> {
    await Sentry.startSpan(
      {
        op: "throttle.wait",
        name: "obaRateLimiter",
      },
      async (span) => {
        const remainingTokens = await this.obaRateLimiter.removeTokens(1)
        span.setAttribute("throttle.remaining_tokens", remainingTokens)
      },
    )

    const methodName = new URL(url).pathname.split("/")[3].split(".")[0]

    this.obaRequestCounter.add(1, {
      feed_code: this.feedCode,
      method: methodName,
    })

    const start = Date.now()
    const resp = await fetch(url, init)
    const duration = Date.now() - start

    this.obaResponseCounter.add(1, {
      feed_code: this.feedCode,
      method: methodName,
      status: resp.status,
    })

    this.obaRequestDuration.record(duration, {
      feed_code: this.feedCode,
      method: methodName,
      status: resp.status,
    })

    return resp
  }
}
