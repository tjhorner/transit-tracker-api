import { PrometheusExporter } from "@opentelemetry/exporter-prometheus"
import { NodeSDK } from "@opentelemetry/sdk-node"

const otelSDK = new NodeSDK({
  metricReader: new PrometheusExporter({
    port: 9090,
  }),
})

export default otelSDK
