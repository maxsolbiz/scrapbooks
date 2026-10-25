import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireModule } from "@/lib/guard";
import { InvoicePrintView } from "@/components/invoices/InvoicePrintView";
import { EmiratesInvoiceView } from "@/components/invoices/EmiratesInvoiceView";
import { InvoiceTemplateSelect } from "@/components/invoices/InvoiceTemplateSelect";
import { PrintButton } from "@/components/invoices/PrintButton";

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
  const invoice = await prisma.invoice.findFirst({
    where: { id, direction: "PURCHASE" },
    include: {
      lines: { orderBy: { id: "asc" } },
      party: { select: { nameEn: true, nameAr: true, trn: true, addressEn: true, addressAr: true, phone: true, email: true } },
    },
  });
  if (!invoice) notFound();
  const company = await prisma.companySettings.findFirstOrThrow();
  const wanted = rawTemplate || company.defaultInvoiceTemplate || "app";
  const template: "app" | "emirates-classic" | "emirates-modern" = EMI_TEMPLATES.has(wanted)
    ? (wanted as "emirates-classic" | "emirates-modern")
    : "app";

  return (
    <div className="space-y-3">
      <div className="flex justify-end items-center gap-3 no-print">
        <InvoiceTemplateSelect value={template} />
        <PrintButton label="Print / طباعة" />
      </div>
      {template === "app" ? (
        <InvoicePrintView data={{ invoice, company }} isTaxInvoice={false} />
      ) : (
        <EmiratesInvoiceView data={{ invoice, company, template }} />
      )}
    </div>
  );
}
