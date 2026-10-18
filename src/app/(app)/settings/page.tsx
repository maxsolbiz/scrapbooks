import { prisma } from "@/lib/db";
import { requireUser, canEdit } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await requireUser();
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const company = await prisma.companySettings.upsert({
    where: { id: "settings" },
    update: {},
    create: { id: "settings" },
  });
  const isAdminLevel = user.role === "ADMIN" || isSuperAdmin;
  const users = isAdminLevel
    ? await prisma.user.findMany({
        where: isSuperAdmin ? undefined : { role: { not: "SUPER_ADMIN" } },
        orderBy: { email: "asc" },
        select: { id: true, name: true, email: true, role: true, isActive: true, permissions: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <PageHeader title={isAdminLevel ? "Settings" : "Company"} description={company.nameEn} />
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
        isAdmin={isAdminLevel && canEdit(user)}
        isSuperAdmin={isSuperAdmin}
        dict={dict}
      />
    </div>
  );
}
