import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "backups/**",
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      "out/**",
      "build/**",
      "releases/**",
      "**/*.d.ts",
    ],
  },
});
