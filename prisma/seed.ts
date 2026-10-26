import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type CoaRow = {
  code: string;
  nameEn: string;
  nameAr: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  normalBalance: "DEBIT" | "CREDIT";
  group?: boolean;
  parentCode?: string;
  cashFlow?: "OPERATING" | "INVESTING" | "FINANCING" | "NONE";
};

const COA: CoaRow[] = [
  { code: "1000", nameEn: "Assets", nameAr: "الأصول", type: "ASSET", normalBalance: "DEBIT", group: true },
  { code: "1100", nameEn: "Current Assets", nameAr: "الأصول المتداولة", type: "ASSET", normalBalance: "DEBIT", group: true, parentCode: "1000" },
  { code: "1110", nameEn: "Cash on Hand", nameAr: "النقد في الصندوق", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100", cashFlow: "OPERATING" },
  { code: "1120", nameEn: "Bank - Current Account", nameAr: "الحساب الجاري البنكي", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100", cashFlow: "OPERATING" },
  { code: "1130", nameEn: "Accounts Receivable", nameAr: "الذمم المدينة", type: "ASSET", normalBalance: "DEBIT", parentCode: "1100" },
  { code: "1150", nameEn: "Fixed Assets", nameAr: "الأصول الثابتة", type: "ASSET", normalBalance: "DEBIT", group: true, parentCode: "1000" },
  { code: "1510", nameEn: "Equipment & Machinery", nameAr: "المعدات والآلات", type: "ASSET", normalBalance: "DEBIT", parentCode: "1150", cashFlow: "INVESTING" },
  { code: "2000", nameEn: "Liabilities", nameAr: "الالتزامات", type: "LIABILITY", normalBalance: "CREDIT", group: true },
  { code: "2100", nameEn: "Accounts Payable", nameAr: "الذمم الدائنة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "2150", nameEn: "VAT Payable (FTA)", nameAr: "ضريبة القيمة المضافة المستحقة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "2200", nameEn: "Salaries Payable", nameAr: "رواتب مستحقة", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "2000" },
  { code: "3000", nameEn: "Equity", nameAr: "حقوق الملكية", type: "EQUITY", normalBalance: "CREDIT", group: true },
  { code: "3100", nameEn: "Owner's Capital", nameAr: "رأس مال المالك", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000" },
  { code: "3900", nameEn: "Retained Earnings", nameAr: "الأرباح المحتجزة", type: "EQUITY", normalBalance: "CREDIT", parentCode: "3000" },
  { code: "4000", nameEn: "Income", nameAr: "الإيرادات", type: "INCOME", normalBalance: "CREDIT", group: true },
  { code: "4100", nameEn: "Scrap Sales Revenue", nameAr: "إيرادات بيع الخردة", type: "INCOME", normalBalance: "CREDIT", parentCode: "4000", cashFlow: "OPERATING" },
  { code: "4200", nameEn: "Other Income", nameAr: "إيرادات أخرى", type: "INCOME", normalBalance: "CREDIT", parentCode: "4000", cashFlow: "OPERATING" },
  { code: "5000", nameEn: "Expenses", nameAr: "المصروفات", type: "EXPENSE", normalBalance: "DEBIT", group: true },
  { code: "5100", nameEn: "Cost of Goods Purchased", nameAr: "تكلفة شراء السلع", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5200", nameEn: "Salaries & Wages", nameAr: "الرواتب والأجور", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5300", nameEn: "Rent Expense", nameAr: "مصروف الإيجار", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5400", nameEn: "Utilities", nameAr: "المرافق", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5500", nameEn: "Fuel & Transport", nameAr: "الوقود والنقل", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5600", nameEn: "Bank Charges", nameAr: "مصاريف بنكية", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
  { code: "5900", nameEn: "Miscellaneous Expense", nameAr: "مصروفات متنوعة", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "5000", cashFlow: "OPERATING" },
];

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
