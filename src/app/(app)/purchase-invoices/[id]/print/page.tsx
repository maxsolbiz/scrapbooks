import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { getPrintInvoice } from "@/lib/print-data";
import { InvoicePrintView } from "@/components/invoices/InvoicePrintView";
import { EmiratesInvoiceView } from "@/components/invoices/EmiratesInvoiceView";
import { InvoiceTemplateSelect } from "@/components/invoices/InvoiceTemplateSelect";
import { PrintButton } from "@/components/invoices/PrintButton";
import { BackButton } from "@/components/invoices/BackButton";

const EMI_TEMPLATES = new Set(["emirates-classic", "emirates-modern"]);

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("purchase-invoices");
  const { id } = await params;
  const sp = await searchParams;
  const rawTemplate = Array.isArray(sp.template) ? sp.template[0] : sp.template;
  const invoice = await getPrintInvoice(id, "PURCHASE");
  if (!invoice) notFound();
  const company = await prisma.companySettings.findFirstOrThrow();
  const wanted = rawTemplate || company.defaultInvoiceTemplate || "app";
  const template: "app" | "emirates-classic" | "emirates-modern" = EMI_TEMPLATES.has(wanted)
    ? (wanted as "emirates-classic" | "emirates-modern")
    : "app";

  return (
    <div className="w-full overflow-x-hidden space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print sm:justify-end">
        <BackButton label="Back / رجوع" />
        <InvoiceTemplateSelect value={template} />
        <PrintButton label="Print / طباعة" />
      </div>
      <div className="w-full overflow-x-auto rounded-md print:overflow-visible">
        {template === "app" ? (
          <InvoicePrintView data={{ invoice, company }} isTaxInvoice={false} />
        ) : (
          <EmiratesInvoiceView data={{ invoice, company, template }} />
        )}
      </div>
    </div>
  );
}
