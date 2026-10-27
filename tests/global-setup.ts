import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse as dotenvParse, config as loadDotenv } from "dotenv";
import { assertTestDatabase, maskUrl, type GuardResult } from "./db-guard";

/**
 * Runs ONCE (globalSetup of the `db` vitest project) before any worker starts:
 *   1. main URL from the .env FILE (dotenv.parse; a missing .env fails closed
 *      inside the guard), test URL from .env.test; guard validates both.
 *   2. `prisma migrate deploy` as a child process whose env has DATABASE_URL
 *      EXPLICITLY set to the validated test URL (dotenv does not override
 *      already-set vars, so an explicit child env is the only safe targeting),
 *      printing the parsed database name for targeting proof.
 * The validated test URL reaches workers via the db project's `test.env`
 * (vitest.config.ts) because globalSetup process.env changes are not
 * propagated to worker processes.
 */

const repoRoot = path.resolve(__dirname, "..");

export function readMainUrlFromEnvFile(): string | undefined {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(".ENV FILE NOT FOUND — main DATABASE_URL is unknown; refusing to run database tests (fail-closed)");
  }
  const parsed = dotenvParse(fs.readFileSync(envPath, "utf8"));
  const url = parsed["DATABASE_URL"];
  if (!url || !url.trim()) {
    throw new Error('.env file has no DATABASE_URL — refusing to run database tests (fail-closed)');
  }
  return url;
}

export default function globalSetup(): void {
  loadDotenv({ path: path.join(repoRoot, ".env.test"), quiet: true });
  const testUrlRaw = process.env.DATABASE_URL_TEST;
  const mainUrlRaw = readMainUrlFromEnvFile();

  const guard = assertTestDatabase(testUrlRaw, mainUrlRaw);
  void guard;
  process.env.DATABASE_URL_TEST = guard.testUrl; // canonical, validated value

  // migrate deploy child process: target forced by explicit env
  const child = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: guard.testUrl },
    timeout: 120_000,
  });
  const dbRef = `${guard.test.host}:${guard.test.port}/${guard.test.database}`;
  console.log(`[db-guard] migrate deploy target: ${dbRef}`);
  const out = `${child.stdout ?? ""}${child.stderr ?? ""}`;
  if (child.status !== 0) {
    console.error(maskUrl(out, guard.testUrl).replace(
      /^postgresql:\/\/[^:@/]+:[^:@/]+@/gm,
      "postgresql://***:***@",
    ));
    throw new Error(`prisma migrate deploy failed (exit ${child.status}) against ${dbRef}`);
  }
  for (const line of out.split("\n")) {
    if (/migrations|database|Datasource|Applied|No pending/i.test(line)) {
      console.log(`[migrate] ${maskUrl(line.trim(), guard.testUrl)}`);
    }
  }
  console.log(`[db-guard] guard OK: test DB "${guard.test.database}" on ${guard.test.host}:${guard.test.port}; main is ${guard.main.host}:${guard.main.port}/${guard.main.database}`);
}

