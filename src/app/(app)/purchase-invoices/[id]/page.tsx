import type { InvoiceDirection } from "@/generated/prisma/client";
import { InvoiceDetailView } from "@/components/invoices/InvoiceDetailView";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDetailView invoiceId={id} direction={"PURCHASE" as InvoiceDirection} />;
}
