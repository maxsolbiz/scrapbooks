import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.test (explicit path) so DATABASE_URL_TEST exists for the db project.
// The MAIN DATABASE_URL is deliberately NOT read from process.env (a DATABASE_URL
// present in .env.test could masquerade as the main URL) — globalSetup reads the
// .env FILE via dotenv.parse(fs.readFileSync(".env")) and passes it to the guard.
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
