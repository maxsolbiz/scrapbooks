-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_supplier_ref_unique" ON "Invoice"("partyId", "supplierRef") WHERE "direction" = 'PURCHASE' AND "supplierRef" IS NOT NULL;
