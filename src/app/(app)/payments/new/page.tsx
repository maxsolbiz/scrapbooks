import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { PaymentForm } from "../PaymentForm";

export default async function NewPaymentPage() {
  await requireEditor();
  const [parties, invoices, locale] = await Promise.all([
    prisma.party.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, nameAr: true, type: true },
    }),
    prisma.invoice.findMany({
      where: { status: "POSTED" },
      orderBy: { date: "asc" },
      include: {
        allocations: { include: { payment: { select: { status: true } } } },
      },
    }),
    getServerLocale(),
  ]);
  const dict = getDictionary(locale);

  const openInvoices = invoices
    .map((inv) => {
      const allocated = inv.allocations
        .filter((a) => a.payment.status !== "VOID")
        .reduce((acc, a) => acc + a.amountFils, 0n);
      const outstanding = (Number(inv.totalFils) - Number(allocated)) / 100;
      return {
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        direction: inv.direction,
        partyId: inv.partyId,
        outstanding: outstanding.toFixed(2),
      };
    })
    .filter((o) => Number(o.outstanding) > 0);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <PaymentForm
      parties={parties}
      openInvoices={openInvoices}
      dict={dict}
      today={today}
    />
  );
}
