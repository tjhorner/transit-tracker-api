import { defineConfig, mergeConfig } from "vitest/config"
import defaultConfig from "./vitest.config"

export default mergeConfig(defaultConfig, defineConfig({
  test: {
    include: ["test/**/*.e2e-spec.ts"],
  },
}))
