import type { InvoiceDirection } from "@/generated/prisma/client";
import { NewInvoicePage } from "@/components/invoices/NewInvoicePage";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const revise = Array.isArray(sp.revise) ? sp.revise[0] : sp.revise;
  const reason = Array.isArray(sp.reason) ? sp.reason[0] : sp.reason;
  return (
    <NewInvoicePage
      direction={"PURCHASE" as InvoiceDirection}
      reviseId={revise || undefined}
      amendReason={reason || undefined}
    />
  );
}
