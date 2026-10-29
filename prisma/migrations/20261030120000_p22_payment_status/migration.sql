-- Drop column first (so we can recreate with new enum type)
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "paymentStatus";

-- Drop old enum (if it exists - but we know PaymentStatus exists in DB from Payment table, so DON'T drop it actually)
-- Instead: create new enum name
CREATE TYPE IF NOT EXISTS "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');

ALTER TABLE "Invoice" ADD COLUMN "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID';
CREATE INDEX IF NOT EXISTS "Invoice_paymentStatus_dueDate_idx" ON "Invoice" ("paymentStatus", "dueDate");
