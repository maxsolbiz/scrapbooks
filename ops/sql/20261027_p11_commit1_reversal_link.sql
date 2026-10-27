-- ============================================================================
-- P1.1 COMMIT (1)+(1b) - REVIEWED PRODUCTION SQL. TO BE APPLIED BY THE USER ONLY.
--
-- APPLY THIS SQL ON PRODUCTION BEFORE DEPLOYING ANY COMMIT THAT CONTAINS THE
-- REGENERATED CLIENT: the client selects JournalEntry.reversesEntryId on every
-- read (including includes from invoices and payments), so deploying code first
-- breaks the app with "column does not exist".
-- ============================================================================
-- 0. Version check first (uncomment, run, confirm result):
-- SELECT version();

-- 1. Additive enum value (migration 20261027062727_add_reversal_source).
--    Single statement, exactly as committed in that migration. Note: on PG >= 12
--    ADD VALUE may appear inside a transaction block, but the new value cannot be
--    USED in the same transaction; keeping it standalone is safe on all versions.
ALTER TYPE "EntrySource" ADD VALUE 'REVERSAL';

-- 2. Reversal link (migration 20261027064800_journal_entry_reversal_link).
--    FK is ON DELETE NO ACTION (checked at statement end): a single bulk deleteMany
--    (demo reset) still works by queueing all deletes, while deleting one original
--    entry that still has a live reversal link is blocked (the audit link survives).
ALTER TABLE "JournalEntry" ADD COLUMN     "reversesEntryId" TEXT;
CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key" ON "JournalEntry"("reversesEntryId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "JournalEntry"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3. If production already has a _prisma_migrations table, record both migrations
--    so a future "migrate deploy" does not attempt to re-run them:
--    npx prisma migrate resolve --applied 20261027062727_add_reversal_source
--    npx prisma migrate resolve --applied 20261027064800_journal_entry_reversal_link
--    (each run with an explicitly printed target database)

-- ============================== ROLLBACK ====================================
-- Apply in reverse order ONLY if needed. Deleting a live reversal link is blocked
-- by the FK design; drop the constraint FIRST:
-- ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_reversesEntryId_fkey";
-- DROP INDEX "JournalEntry_reversesEntryId_key";
-- ALTER TABLE "JournalEntry" DROP COLUMN "reversesEntryId";
-- NOTE: enum value 'REVERSAL' cannot be dropped via ALTER TYPE ... DROP VALUE
-- (unsupported); it simply remains unused - acceptable.
-- ============================================================================
