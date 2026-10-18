import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import type { InvoiceDirection } from "@/generated/prisma/client";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";

export async function NewInvoicePage({ direction }: { direction: InvoiceDirection }) {
  await requireEditor();
  const [partiesRaw, itemsRaw, locale] = await Promise.all([
    prisma.party.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, nameAr: true, trn: true, type: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { nameEn: "asc" },
      select: {
        id: true,
        code: true,
        nameEn: true,
        nameAr: true,
        unit: true,
        defaultRate: true,
        vatRate: true,
      },
    }),
    getServerLocale(),
  ]);
  const dict = getDictionary(locale);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <InvoiceForm
      direction={direction}
      parties={partiesRaw}
      items={itemsRaw.map((i) => ({
        id: i.id,
        code: i.code,
        nameEn: i.nameEn,
        nameAr: i.nameAr,
        unit: i.unit,
        defaultRate: i.defaultRate ? i.defaultRate.toString() : null,
        vatRate: Number(i.vatRate),
      }))}
      dict={dict}
      today={today}
    />
  );
}
