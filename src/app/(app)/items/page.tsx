import { prisma } from "@/lib/db";
import { moduleCan, requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { ItemsClient } from "./ItemsClient";

export default async function ItemsPage() {
  const user = await requireModule("items");
  const [raw, locale] = await Promise.all([
    prisma.item.findMany({ orderBy: { nameEn: "asc" } }),
    getServerLocale(),
  ]);
  const dict = getDictionary(locale);
  const rows = raw.map((it) => ({
    id: it.id,
    code: it.code,
    nameEn: it.nameEn,
    nameAr: it.nameAr,
    unit: it.unit,
    defaultRate: it.defaultRate ? it.defaultRate.toString() : null,
    vatRate: Number(it.vatRate),
    isActive: it.isActive,
  }));

  return <ItemsClient rows={rows} dict={dict} canWrite={await moduleCan(user, "items", "write")} />;
}
