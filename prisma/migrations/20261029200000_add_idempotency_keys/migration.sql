-- Add idempotencyKey to Invoice
ALTER TABLE "Invoice" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");

-- Add idempotencyKey to Payment
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- Add idempotencyKey to JournalEntry
ALTER TABLE "JournalEntry" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");