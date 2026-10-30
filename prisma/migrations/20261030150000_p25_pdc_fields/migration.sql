-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PDC_IN';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PDC_OUT';

-- CreateEnum
CREATE TYPE "PDCStatus" AS ENUM ('PENDING', 'CLEARED', 'BOUNCED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "chequeNo" TEXT;
ALTER TABLE "Payment" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "clearanceDate" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "pdcStatus" "PDCStatus" DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Payment_clearanceDate_idx" ON "Payment"("clearanceDate");
CREATE INDEX "Payment_pdcStatus_idx" ON "Payment"("pdcStatus");
