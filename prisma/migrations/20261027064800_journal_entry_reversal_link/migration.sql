/*
 P1.1 commit 1: reversal link. Additive only - existing rows keep NULL.
 Generated via: npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
 (from = scrapbooks_test at localhost:54322 explicit env; TTY-free substitute for migrate dev --create-only, reviewed before commit)
*/

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "reversesEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key" ON "JournalEntry"("reversesEntryId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
