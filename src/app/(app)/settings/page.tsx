import { prisma } from "@/lib/db";
import { requireUser, canEdit } from "@/lib/guard";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await requireUser();
  const company = await prisma.companySettings.upsert({
    where: { id: "settings" },
    update: {},
    create: { id: "settings" },
  });
  const users =
    user.role === "ADMIN"
      ? await prisma.user.findMany({
          orderBy: { email: "asc" },
          select: { id: true, name: true, email: true, role: true, isActive: true },
        })
      : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{user.role === "ADMIN" ? "Settings" : "Company"}</h1>
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
        users={users}
        isAdmin={user.role === "ADMIN" && canEdit(user)}
      />
    </div>
  );
}
