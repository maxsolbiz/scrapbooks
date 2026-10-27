import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.test (explicit path) so DATABASE_URL_TEST exists for the db project.
// The MAIN DATABASE_URL is deliberately NOT read from process.env (a DATABASE_URL
// present in .env.test could masquerade as the main URL) — globalSetup reads the
// .env FILE via dotenv.parse(fs.readFileSync(".env")) and passes it to the guard.
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

// Workers access the validated test URL via the db project's test.env (vitest does
// not propagate globalSetup process.env changes into worker processes). The value
// is re-validated by tests/db/setup.ts and re-asserted before every TRUNCATE.
const TEST_URL = process.env.DATABASE_URL_TEST ?? "";

const repoRoot = __dirname;
const ALIAS = { "@": path.resolve(repoRoot, "src") };

export default defineConfig({
  test: {
    globals: false,
    projects: [
      {
        resolve: { alias: ALIAS },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          globals: false,
        },
      },
      {
        resolve: { alias: ALIAS },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          globals: false,
          // DB tests truncate shared tables, so they must never run in parallel.
          fileParallelism: false,
          globalSetup: ["tests/global-setup.ts"],
          setupFiles: ["tests/db/setup.ts"],
          env: { DATABASE_URL: TEST_URL },
        },
      },
    ],
  },
});
