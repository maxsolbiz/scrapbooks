-- P3.1 / D1: InvoiceDeduction moves to a VAT-exclusive base + proportional VAT split.
-- Input is baseAmountFils; vatFils = roundHalfUp(base * vatRate); totalFils = base + vatFils.
-- The JE adjusts Base + VAT + AR/AP; the original invoice totals stay untouched (P1.1).
--
-- Curated from `npx prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` (from = scrapbooks at localhost:54322, explicit env,
-- target printed). The raw diff also carried unrelated index-drift statements
-- (DROP INDEX purchase_invoice_unique / Payment_clearanceDate_idx / Payment_pdcStatus_idx
-- and a recreate of purchase_invoice_supplier_ref_unique) — NOT applied here
-- (separate concerns, one migration = one concern).

-- Enum: DISCOUNT -> COMMERCIAL_DISCOUNT (in-place rename preserves existing rows).
ALTER TYPE "DeductionReason" RENAME VALUE 'DISCOUNT' TO 'COMMERCIAL_DISCOUNT';

-- Columns: add nullable, backfill legacy VAT-neutral rows, then enforce NOT NULL.
ALTER TABLE "InvoiceDeduction" ADD COLUMN "baseAmountFils" BIGINT;
ALTER TABLE "InvoiceDeduction" ADD COLUMN "vatRate" DECIMAL(5,4) NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceDeduction" ADD COLUMN "vatFils" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceDeduction" ADD COLUMN "totalFils" BIGINT NOT NULL DEFAULT 0;

-- Backfill: legacy P2.6 deductions posted a single base-only JE (no VAT leg), so
-- preserve their amounts exactly (base = old amountFils, vat = 0) to keep
-- historical JEs reconciling. New deductions follow D1 and compute all three.
UPDATE "InvoiceDeduction"
SET "baseAmountFils" = "amountFils", "totalFils" = "amountFils", "vatFils" = 0, "vatRate" = 0
WHERE "amountFils" IS NOT NULL;

ALTER TABLE "InvoiceDeduction" ALTER COLUMN "baseAmountFils" SET NOT NULL;
ALTER TABLE "InvoiceDeduction" DROP COLUMN "amountFils";
