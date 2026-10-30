-- CreateEnum
CREATE TYPE "DeductionReason" AS ENUM ('SHORTAGE', 'DAMAGE', 'DISCOUNT', 'RETURN', 'OTHER');

-- CreateTable
CREATE TABLE "InvoiceDeduction" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "reason" "DeductionReason" NOT NULL,
  "amountFils" BIGINT NOT NULL,
  "notes" TEXT,
  "journalEntryId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDeduction_invoiceId_idx" ON "InvoiceDeduction"("invoiceId");
CREATE INDEX "InvoiceDeduction_createdAt_idx" ON "InvoiceDeduction"("createdAt");
CREATE UNIQUE INDEX "InvoiceDeduction_journalEntryId_key" ON "InvoiceDeduction"("journalEntryId");

-- AddForeignKey
ALTER TABLE "InvoiceDeduction" ADD CONSTRAINT "InvoiceDeduction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDeduction" ADD CONSTRAINT "InvoiceDeduction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDeduction" ADD CONSTRAINT "InvoiceDeduction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
