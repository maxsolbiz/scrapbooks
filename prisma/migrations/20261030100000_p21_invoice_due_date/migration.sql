-- P2.1: Add dueDate and paymentTerms to Invoice model
ALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "paymentTerms" INTEGER;

-- Index for dueDate queries (aging reports)
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice" ("dueDate");
