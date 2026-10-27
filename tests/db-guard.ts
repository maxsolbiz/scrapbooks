/**
 * Pure database-safety guard. No env mutation here — the caller (tests/global-setup.ts)
 * applies the returned test URL to process.env.DATABASE_URL.
 *
 * IMPORTANT: the pg driver (@prisma/adapter-pg → pg-connection-string) lets URL
 * QUERY PARAMETERS override the effective host/port (e.g. ?host=prod.example.com
 * or ?port=6543). The guard therefore:
 *  - test URL: allows ONLY the params `schema` and `sslmode`; ANY other param name
 *    (host, hostaddr, port, dbname, database, user, service, …) is a hard rejection.
 *  - main URL: parsed leniently, but its EFFECTIVE host/port apply any `host`/`port`
 *    query override, so the "same target" comparison cannot be fooled.
 *
 * Rules (all mandatory):
 *  - DATABASE_URL_TEST is set.
 *  - Parsed effective host, port AND database name differ from the main DATABASE_URL
 *    (main URL read-only via the .env FILE in globalSetup, never process.env — vitest
 *    does not load .env, and .env.test must not masquerade as the main URL).
 *  - Test database name ends in "_test".
 *  - Test host is in {localhost, 127.0.0.1, ::1}.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Query params allowed on the TEST url — anything else could change the effective target. */
const TEST_URL_ALLOWED_PARAMS = new Set(["schema", "sslmode"]);

export interface ParsedUrl {
  host: string;
  port: string;
  database: string;
}

function parseUrl(raw: string | undefined, label: string, strictParams: boolean): ParsedUrl {
  if (!raw || !raw.trim()) {
    throw new Error(`${label} is empty or unset`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL: value withheld for safety`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label} must be a postgres:// URL, got protocol "${url.protocol}"`);
  }

  if (strictParams) {
    for (const key of url.searchParams.keys()) {
      if (!TEST_URL_ALLOWED_PARAMS.has(key)) {
        throw new Error(
          `${label} contains a forbidden query parameter "${key}" (query params can override host/port in pg-connection-string; only ${[...TEST_URL_ALLOWED_PARAMS].join(" and ")} are allowed)`,
        );
      }
    }
  }

  // Effective host/port: query params `host` / `port` override the authority
  // (pg-connection-string behavior). Always computed so comparisons cannot be fooled.
  const host = url.searchParams.get("host") || url.hostname;
  const port = url.searchParams.get("port") || url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error(`${label} has no database name`);
  return { host, port, database };
}

/**
 * Lenient parser for the MAIN url only (host/port query overrides still applied to
 * the effective target). Named *_Lenient so the harness cannot accidentally use it
 * on the TEST url, which must go through the strict path in assertTestDatabase.
 */
export function parseDbUrlLenient(raw: string | undefined): ParsedUrl {
  return parseUrl(raw, "Database URL", false);
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
    throw new Error("DATABASE_URL is not set — the main URL is unknown, so refusing to run database tests (fail-closed. globalSetup must read the .env FILE via dotenv.parse; a missing .env leaves no safe comparison target)");
  }

  const test = parseUrl(testUrlRaw, "DATABASE_URL_TEST", true);
  const main = parseUrl(mainUrlRaw, "DATABASE_URL", false);

  if (!LOCAL_HOSTS.has(test.host)) {
    throw new Error(
      `DATABASE_URL_TEST effective host "${test.host}" is not a local host (allowed: localhost, 127.0.0.1, ::1)`,
    );
  }
  if (!test.database.endsWith("_test")) {
    throw new Error(`DATABASE_URL_TEST database name "${test.database}" must end in "_test"`);
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

/**
 * Pure worker-URL check (moved out of tests/db/setup.ts so it is unit-testable).
 * Throws on ANY problem; setup.ts must call this BEFORE importing @/lib/db
 * (that module silently falls back to the DEV database when DATABASE_URL is unset).
 */
export function assertWorkerUrl(workerUrl: string | undefined, validatedUrl: string): void {
  if (!workerUrl || !workerUrl.trim()) {
    throw new Error(
      "Worker has NO DATABASE_URL — aborting before @/lib/db import (its fallback would connect to the DEV database)",
    );
  }
  if (workerUrl !== validatedUrl) {
    throw new Error("Worker DATABASE_URL does not equal the validated test URL — aborting (unsafe target)");
  }
}

/**
 * Literal (non-regex) secret masking. split/join is used because URLs contain
 * regex metacharacters (?, ., +) that would break `new RegExp(url, "g")`.
 * An empty secret must be a no-op so the text is never corrupted.
 */
export function maskSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}

/**
 * Mask a connection URL AND its parsed password (URL.password) with the same
 * transaction-safe technique, in addition to the full-URL match, so a truncated
 * or partially-printed URL cannot leak the credential. Percent-decoding is
 * attempted for the password as well. Unknown/unparseable URLs still get the
 * full-string mask.
 */
export function maskUrl(text: string, url: string): string {
  let out = maskSecret(text, url);
  try {
    const pw = new URL(url).password;
    if (pw) {
      out = maskSecret(out, pw);
      try {
        const decoded = decodeURIComponent(pw);
        if (decoded !== pw) out = maskSecret(out, decoded);
      } catch {
        /* malformed percent-encoding; raw form already masked */
      }
    }
  } catch {
    /* not a parseable URL; full-string mask already applied */
  }
  return out;
}
