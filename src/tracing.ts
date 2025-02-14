import { NodeSDK } from "@opentelemetry/sdk-node"
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus"

const otelSDK = new NodeSDK({
  metricReader: new PrometheusExporter({
    port: 9090,
  }),
})

process.on("SIGTERM", () => {
  otelSDK
    .shutdown()
    .then(
      () => console.log("OTel SDK shut down successfully"),
      (err) => console.log("Error shutting down OTel SDK", err),
    )
    .finally(() => process.exit(0))
})

export default otelSDK
