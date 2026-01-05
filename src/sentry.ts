import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"

Sentry.init({
  integrations: [
    nodeProfilingIntegration() as any,
  ],
  profileLifecycle: "trace",
  profileSessionSampleRate: process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_PROFILE_SESSION_SAMPLE_RATE)
    : 1,
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.15,
})
