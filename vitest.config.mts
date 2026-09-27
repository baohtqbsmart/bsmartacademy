import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const fromRoot = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // The real package throws outside React Server Components.
      "server-only": fromRoot("./tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
