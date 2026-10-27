/**
 * Pure database-safety guard. No env mutation here — the caller (tests/global-setup.ts)
 * applies the returned test URL to process.env.DATABASE_URL.
 *
 * Rules (all mandatory):
 *  - DATABASE_URL_TEST is set.
 *  - Parsed host, port AND database name differ from the main DATABASE_URL
 *    (main URL read-only via `.env`, since vitest does not load it).
 *  - Test database name ends in "_test".
 *  - Test host is in {localhost, 127.0.0.1, ::1}.
 *  - Test database name is not the dev fallback name "scrapbooks" (src/lib/db.ts).
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DEV_FALLBACK_DB = "scrapbooks";

export interface ParsedUrl {
  host: string;
  port: string;
  database: string;
}

export function parseDbUrl(raw: string | undefined): ParsedUrl {
  if (!raw || !raw.trim()) {
    throw new Error("Database URL is empty or unset");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Database URL is not a valid URL: value withheld for safety`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`Database URL must be a postgres:// URL, got protocol "${url.protocol}"`);
  }
  const host = url.hostname;
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || url.searchParams.get("database") || "";
  if (!database) throw new Error("Database URL has no database name");
  return { host, port, database };
}

export interface GuardResult {
  testUrl: string;
  test: ParsedUrl;
  main: ParsedUrl;
}

/** Pure validator. Throws on ANY problem; returns parsed info when safe. */
export function assertTestDatabase(
  testUrlRaw: string | undefined,
  mainUrlRaw: string | undefined,
): GuardResult {
  if (!testUrlRaw || !testUrlRaw.trim()) {
    throw new Error("DATABASE_URL_TEST is not set — refusing to run database tests");
  }
  if (!mainUrlRaw || !mainUrlRaw.trim()) {
    throw new Error("DATABASE_URL is not set (load .env read-only before calling the guard) — refusing to run database tests");
  }

  const test = parseDbUrl(testUrlRaw);
  const main = parseDbUrl(mainUrlRaw);

  if (!LOCAL_HOSTS.has(test.host)) {
    throw new Error(
      `DATABASE_URL_TEST host "${test.host}" is not a local host (allowed: localhost, 127.0.0.1, ::1)`,
    );
  }
  if (!test.database.endsWith("_test")) {
    throw new Error(`DATABASE_URL_TEST database name "${test.database}" must end in "_test"`);
  }
  if (test.database === DEV_FALLBACK_DB) {
    throw new Error(`DATABASE_URL_TEST database name "${test.database}" is the dev fallback name and is not acceptable`);
  }
  if (
    test.host === main.host &&
    test.port === main.port &&
    test.database === main.database
  ) {
    throw new Error(`DATABASE_URL_TEST resolves to the same host:port/database as DATABASE_URL (${main.host}:${main.port}/${main.database}) — refusing to run`);
  }

  return { testUrl: testUrlRaw, test, main };
}
