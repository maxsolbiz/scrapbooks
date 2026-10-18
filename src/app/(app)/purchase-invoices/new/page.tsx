import type { InvoiceDirection } from "@/generated/prisma/client";
import { NewInvoicePage } from "@/components/invoices/NewInvoicePage";

export default async function Page() {
  return <NewInvoicePage direction={"PURCHASE" as InvoiceDirection} />;
}
