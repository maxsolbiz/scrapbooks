-- P3.2 Invoice revision / amend flow: link a revision to the invoice it amends
-- and track the revision depth. The original invoice is reversed (P1.1) + VOID,
-- never mutated; onDelete Restrict keeps the original row for the audit trail.
-- Generated via: npx prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script (from = scrapbooks at localhost:54322), then
-- curtailed to the P3.2 statements only (unrelated index-drift rows removed;
-- one concern per migration). Reviewed before commit; no BOM.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "revisesInvoiceId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Invoice_revisesInvoiceId_idx" ON "Invoice"("revisesInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_revisesInvoiceId_fkey" FOREIGN KEY ("revisesInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
