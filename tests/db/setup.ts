import fs from "node:fs";
import path from "node:path";
import { parse as dotenvParse } from "dotenv";
import { assertTestDatabase } from "../db-guard";
import { setHarnessContext } from "./helpers";

/**
 * Per-worker setupFile for the db project (executed as plain module code — no
 * exported setup function). Runs BEFORE test files import @/lib/db.
 * process.env.DATABASE_URL reaches the worker only via the db project's `test.env`
 * in vitest.config.ts (originating from .env.test, re-validated here against the
 * .env file). If the URL is missing, wrong or points anywhere but a local *_test
 * database, the worker aborts BEFORE the Prisma client (with its localhost dev
 * fallback, src/lib/db.ts) is ever imported.
 */
const repoRoot = path.resolve(__dirname, "..", "..");

let mainUrl: string | undefined;
try {
  mainUrl = dotenvParse(fs.readFileSync(path.join(repoRoot, ".env"), "utf8")).DATABASE_URL;
} catch {
  mainUrl = undefined;
}

const guard = assertTestDatabase(process.env.DATABASE_URL_TEST, mainUrl);
if (process.env.DATABASE_URL !== guard.testUrl) {
  if (!process.env.DATABASE_URL) {
    throw new Error("Worker has NO DATABASE_URL — aborting before @/lib/db import (its fallback would connect to the DEV database)");
  }
  throw new Error("Worker DATABASE_URL does not equal the validated test URL — aborting (unsafe target)");
}

// Only now is it safe to pull in the app's Prisma client.
const { prisma } = (await import("@/lib/db")) as { prisma: import("@/generated/prisma/client").PrismaClient };
await prisma.$queryRaw`SELECT 1`;
setHarnessContext(guard, mainUrl!);
console.log(`[worker-setup] harness set: test DB "${guard.test.database}"`);
