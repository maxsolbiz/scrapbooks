import { prisma } from "@/lib/db";
import { requireUser, canEdit } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const company = await prisma.companySettings.upsert({
    where: { id: "settings" },
    update: {},
    create: { id: "settings" },
  });
  const users =
    user.role === "ADMIN"
      ? await prisma.user.findMany({
          orderBy: { email: "asc" },
          select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
        })
      : [];

  return (
    <div className="space-y-4">
      <PageHeader title={user.role === "ADMIN" ? "Settings" : "Company"} description={company.nameEn} />
      <SettingsClient
        company={{
          nameEn: company.nameEn,
          nameAr: company.nameAr,
          trn: company.trn,
          addressEn: company.addressEn,
          addressAr: company.addressAr,
          phone: company.phone,
          email: company.email,
          bankDetailsEn: company.bankDetailsEn,
          bankDetailsAr: company.bankDetailsAr,
        }}
        users={users.map((u) => ({ ...u, permissions: (u.permissions as unknown) ?? null }))}
        isAdmin={user.role === "ADMIN" && canEdit(user)}
        dict={dict}
      />
    </div>
  );
}
