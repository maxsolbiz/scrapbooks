-- ============================================================================
-- P1.1 COMMIT (1) — reviewed production SQL. TO BE APPLIED BY THE USER ONLY
-- (never executed against production by any automation).
-- Target: https://accounts.maxsolbiz.com production database.
-- Statements are SEPARATE (no explicit transaction block) per reviewer mandate;
-- ALTER TYPE ... ADD VALUE must not run inside a transaction block on any
-- Postgres that requires it (12+ allows it outside tx-safe contexts; kept
-- standalone to be safe on all supported versions).
-- Rollback block is commented and must be applied in reverse order at the end.
-- ============================================================================

-- 0. Version check first (uncomment, run, confirm >= supported version):
-- SELECT version();

-- 1. Additive enum value (migration 20261027062727_add_reversal_source)
ALTER TYPE "EntrySource" ADD VALUE 'REVERSAL';

-- 2. Reversal link (migration 20261027064800_journal_entry_reversal_link)
ALTER TABLE "JournalEntry" ADD COLUMN     "reversesEntryId" TEXT;
CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key" ON "JournalEntry"("reversesEntryId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================== ROLLBACK ====================================
-- Apply in reverse order ONLY if needed (drops data-removing steps carefully;
-- reversal data itself would be lost, which is why this is commented):
-- ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_reversesEntryId_fkey";
-- DROP INDEX "JournalEntry_reversesEntryId_key";
-- ALTER TABLE "JournalEntry" DROP COLUMN "reversesEntryId";
-- NOTE: enum value 'REVERSAL' cannot be dropped via ALTER TYPE ... DROP VALUE
-- (not supported); it simply remains unused - acceptable.
-- ============================================================================
