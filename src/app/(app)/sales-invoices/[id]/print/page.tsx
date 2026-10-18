import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { getServerLocale } from "@/lib/i18n";
import { InvoicePrintView } from "@/components/invoices/InvoicePrintView";
import { PrintButton } from "@/components/invoices/PrintButton";

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, direction: "SALES" },
    include: {
      lines: { orderBy: { id: "asc" } },
      party: { select: { nameEn: true, nameAr: true, trn: true, addressEn: true, addressAr: true } },
    },
  });
  if (!invoice) notFound();
  const company = await prisma.companySettings.findFirstOrThrow();

  return (
    <div className="space-y-3">
      <div className="flex justify-end no-print">
        <PrintButton label="Print / طباعة" />
      </div>
      <InvoicePrintView
        data={{ invoice, company }}
        isTaxInvoice={invoice.direction === "SALES"}
      />
    </div>
  );
}
