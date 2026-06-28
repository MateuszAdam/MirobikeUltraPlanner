import { defineConfig } from "vitest/config";

// Testy rdzenia logiki — środowisko node (czyste funkcje, bez DOM/PWA).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
