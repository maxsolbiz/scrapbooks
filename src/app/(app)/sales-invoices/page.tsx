import type { InvoiceDirection } from "@/generated/prisma/client";
import { InvoiceListPage } from "@/components/invoices/InvoiceListPage";

export default async function Page() {
  return <InvoiceListPage direction={"SALES" as InvoiceDirection} />;
}
