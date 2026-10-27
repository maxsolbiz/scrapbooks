import type { PrismaClient } from "@/generated/prisma/client";
import { assertTestDatabase, type GuardResult } from "../db-guard";
import type { Tx } from "@/lib/tx";

/**
 * Test harness helpers for the `db` vitest project.
 *
 * Isolation modes:
 *  - Mode A (withTxRollback): runs fn(tx) inside prisma.$transaction and throws a
 *    sentinel to force rollback. ONLY for functions that take a tx.
 *  - Mode B (runCommitted + truncateAll): fn uses the global prisma instance
 *    (e.g. every function in src/lib/reports.ts) and COMMITS; callers truncate.
 *
 * How DATABASE_URL reaches workers: the db project's `test.env` in vitest.config.ts
 * (sourced from .env.test; globalSetup process.env changes are NOT propagated to
 * worker processes). tests/db/setup.ts re-validates it BEFORE @/lib/db is imported,
 * because src/lib/db.ts silently falls back to the DEV database when the env is absent.
 *
 * GROUND-TRUTH SAFETY: the string guard alone cannot protect a worker that connected
 * through some other path, so truncateAll re-runs the guard immediately before it,
 * then runs `SELECT current_database()` on the SAME connection (the app's prisma
 * pool) and aborts unless the live database equals the validated "_test" name.
 *
 * TRUNCATE lists tables DYNAMICALLY from information_schema (schema public, excluding
 * _prisma_migrations) so later phases cannot forget new tables; identifiers are
 * double-quoted because Prisma creates case-sensitive tables (e.g. "JournalLine").
 *
 * TEST HYGIENE: every DB test file must start with truncateAll(prisma) (shared
 * worker state; a missing truncate causes unique-constraint collisions).
 */

const sentinel = Symbol("rollback-sentinel");

export const harness: { guard: GuardResult; mainUrlRaw: string } = { guard: null as never, mainUrlRaw: "" };

export function setHarnessContext(guard: GuardResult, mainUrlRaw: string): void {
  harness.guard = guard;
  harness.mainUrlRaw = mainUrlRaw;
}

export async function withTxRollback<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let captured: T;
  try {
    await prisma.$transaction(async (tx) => {
      captured = await fn(tx);
      throw sentinel;
    });
  } catch (e) {
    if (e !== sentinel) throw e;
  }
  return captured!;
}

/** Guard re-run + live-connection ground truth. Throws on ANY mismatch. */
export async function assertCurrentDatabase(prisma: PrismaClient): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe<{ current_database: string }[]>(
    "SELECT current_database()",
  )) as unknown as { current_database: string }[];
  const live = rows[0]?.current_database;
  const expected = harness.guard.test.database;
  if (live !== expected || !live.endsWith("_test")) {
    throw new Error(
      `GROUND TRUTH MISMATCH: live connection database "${live}" !== validated test database "${expected}" — ABORTING, nothing truncated`,
    );
  }
}

/** Dynamic, fully-quoted TRUNCATE of every non-migration table in schema public. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL_TEST, harness.mainUrlRaw);
  await assertCurrentDatabase(prisma);
  const tables = (await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' AND table_type = 'BASE TABLE'`,
  )) as unknown as { table_name: string }[];
  if (!tables.length) return;
  const list = tables.map((t) => `"public"."${t.table_name.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
