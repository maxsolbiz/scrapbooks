import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.test (explicit path); fall back to .env (read-only comparison uses the
// same loader inside tests/db-guard.ts). dotenv does NOT override already-set vars.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: false,
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          globals: false,
        },
      },
      {
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          globals: false,
          // DB tests truncate shared tables, so they must never run in parallel.
          fileParallelism: false,
          globalSetup: ["tests/global-setup.ts"],
        },
      },
    ],
  },
});
