import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolução nativa dos paths do tsconfig (`@/`) — vitest 4 dispensa o plugin.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
