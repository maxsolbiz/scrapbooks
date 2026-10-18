import { prisma } from "@/lib/db";
import { moduleCan, requireModule } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { PartiesClient } from "./PartiesClient";

export default async function PartiesPage() {
  const user = await requireModule("parties");
  const [rows, locale] = await Promise.all([
    prisma.party.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        type: true,
        nameEn: true,
        nameAr: true,
        trn: true,
        phone: true,
        email: true,
        isActive: true,
      },
    }),
    getServerLocale(),
  ]);
  const dict = getDictionary(locale);

  return <PartiesClient rows={rows} dict={dict} canWrite={await moduleCan(user, "parties", "write")} />;
}
