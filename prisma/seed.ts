import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COA, type CoaRow } from "./coa";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});





async function main() {
  await prisma.companySettings.upsert({
    where: { id: "settings" },
    update: {},
    create: {},
  });

  const users = [
    { email: "admin@maxsolbiz.com", name: "Admin", role: "ADMIN" as const },
    { email: "accountant@maxsolbiz.com", name: "Accountant", role: "ACCOUNTANT" as const },
    { email: "viewer@maxsolbiz.com", name: "Viewer", role: "VIEWER" as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: await hash(process.env.DEMO_PASSWORD ?? "demo-change-me", 12) },
    });
  }

  const byCode = new Map<string, string>();
  for (const row of COA) {
    const existing = await prisma.account.findUnique({ where: { code: row.code } });
    if (existing) {
      byCode.set(row.code, existing.id);
      continue;
    }
    const created = await prisma.account.create({
      data: {
        code: row.code,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        type: row.type,
        normalBalance: row.normalBalance,
        isGroup: row.group ?? false,
        cashFlowClass: row.cashFlow ?? "NONE",
        parentId: row.parentCode ? byCode.get(row.parentCode) : null,
      },
    });
    byCode.set(row.code, created.id);
  }

  await prisma.fiscalYear.upsert({
    where: { name: "FY2026" },
    update: {},
    create: { name: "FY2026", starts: new Date("2026-01-01"), ends: new Date("2026-12-31"), status: "OPEN" },
  });

  const items = [
    { nameEn: "Copper Scrap", nameAr: "خردة نحاس", unit: "KG" as const, defaultRate: 2500 },
    { nameEn: "Aluminium Scrap", nameAr: "خردة ألومنيوم", unit: "KG" as const, defaultRate: 650 },
    { nameEn: "Car Batteries", nameAr: "بطاريات سيارات", unit: "PCS" as const, defaultRate: 500 },
    { nameEn: "Old Iron / Steel", nameAr: "حديد وصلب قديم", unit: "TON" as const, defaultRate: 120000 },
    { nameEn: "Carton Boxes", nameAr: "كرتون", unit: "KG" as const, defaultRate: 45 },
  ];
  for (const item of items) {
    await prisma.item.upsert({
      where: { code: item.nameEn.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 12) },
      update: {},
      create: { ...item, code: item.nameEn.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 12) },
    });
  }

  const parties = [
    { code: "CUST-001", type: "CUSTOMER" as const, nameEn: "Emirates Metal Trading LLC", nameAr: "الإمارات للتجارة المعادن ذ.م.م", trn: "100123456700003" },
    { code: "VEND-001", type: "VENDOR" as const, nameEn: "Sharjah Junk Traders", nameAr: "تجار خردة الشارقة", trn: "100765432100003" },
  ];
  for (const p of parties) {
    await prisma.party.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  console.log("Seed complete: users, COA (%d accounts), FY2026, items, parties", COA.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
