import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    coverage: {
      include: ["src/**/*.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.spec.ts"],
          setupFiles: ["./test/unit/setup.ts"],
        }
      },
      {
        extends: true,
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.spec.ts"],
        }
      }
    ]
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: "es6" },
    }),
  ],
  resolve: {
    alias: {
      // Ensure Vitest correctly resolves TypeScript path aliases
      src: resolve(__dirname, "./src"),
    },
  },
})
