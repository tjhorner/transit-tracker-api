import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"
import { env } from "../env"
import { annotateDomainErrorKind } from "./before-send"

Sentry.init({
  integrations: [nodeProfilingIntegration() as any],
  beforeSend: annotateDomainErrorKind,
  debug: env.boolean("SENTRY_DEBUG"),
  profileLifecycle: "trace",
  profileSessionSampleRate: env.float("SENTRY_PROFILE_SESSION_SAMPLE_RATE", 1),
  tracesSampleRate: env.float("SENTRY_TRACES_SAMPLE_RATE", 0.15),
})
