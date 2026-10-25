-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "defaultInvoiceTemplate" TEXT NOT NULL DEFAULT 'app';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryNoteDate" TIMESTAMP(3),
ADD COLUMN     "modeOfPayment" TEXT,
ADD COLUMN     "purchaseOrder" TEXT,
ADD COLUMN     "supplierRef" TEXT,
ADD COLUMN     "termsOfDelivery" TEXT,
ADD COLUMN     "vehicleNo" TEXT;
