import { prisma } from "@/lib/db";
import { hash } from "bcryptjs";
import { createInvoice } from "@/lib/invoices";
import { createPayment } from "@/lib/payments";
import { postJournalEntry } from "@/lib/accounting";
import type { Tx } from "@/lib/tx";
import type { PrismaClient } from "@/generated/prisma/client";
import type { InvoiceDirection } from "@/generated/prisma/enums";

export interface DemoResult {
  accounts: number;
  items: number;
  parties: number;
  salesInvoices: number;
  purchaseInvoices: number;
  payments: number;
  journals: number;
}

// Deterministic pseudo-random so every reset yields identical demo numbers.
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const COA = [
  { code: "1000", nameEn: "Assets", nameAr: "الأصول", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "1100", nameEn: "Current Assets", nameAr: "الأصول المتداولة", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "1110", nameEn: "Cash on Hand", nameAr: "النقد في الصندوق", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "1120", nameEn: "Bank - Current Account", nameAr: "الحساب الجاري البنكي", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "1130", nameEn: "Accounts Receivable", nameAr: "الذمم المدينة", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "1150", nameEn: "Fixed Assets", nameAr: "الأصول الثابتة", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "1510", nameEn: "Equipment & Machinery", nameAr: "المعدات والآلات", type: "ASSET" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "INVESTING" as const },
  { code: "2000", nameEn: "Liabilities", nameAr: "الالتزامات", type: "LIABILITY" as const, normalBalance: "CREDIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "2100", nameEn: "Accounts Payable", nameAr: "الذمم الدائنة", type: "LIABILITY" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "2150", nameEn: "VAT Payable (FTA)", nameAr: "ضريبة القيمة المضافة المستحقة", type: "LIABILITY" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "2200", nameEn: "Salaries Payable", nameAr: "رواتب مستحقة", type: "LIABILITY" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "3000", nameEn: "Equity", nameAr: "حقوق الملكية", type: "EQUITY" as const, normalBalance: "CREDIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "3100", nameEn: "Owner's Capital", nameAr: "رأس مال المالك", type: "EQUITY" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "3900", nameEn: "Retained Earnings", nameAr: "الأرباح المحتجزة", type: "EQUITY" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "NONE" as const },
  { code: "4000", nameEn: "Income", nameAr: "الإيرادات", type: "INCOME" as const, normalBalance: "CREDIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "4100", nameEn: "Scrap Sales Revenue", nameAr: "إيرادات بيع الخردة", type: "INCOME" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "4200", nameEn: "Other Income", nameAr: "إيرادات أخرى", type: "INCOME" as const, normalBalance: "CREDIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5000", nameEn: "Expenses", nameAr: "المصروفات", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: true, cashFlowClass: "NONE" as const },
  { code: "5100", nameEn: "Cost of Goods Purchased", nameAr: "تكلفة شراء السلع", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5200", nameEn: "Salaries & Wages", nameAr: "الرواتب والأجور", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5300", nameEn: "Rent Expense", nameAr: "مصروف الإيجار", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5400", nameEn: "Utilities", nameAr: "المرافق", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5500", nameEn: "Fuel & Transport", nameAr: "الوقود والنقل", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5600", nameEn: "Bank Charges", nameAr: "مصاريف بنكية", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
  { code: "5900", nameEn: "Miscellaneous Expense", nameAr: "مصروفات متنوعة", type: "EXPENSE" as const, normalBalance: "DEBIT" as const, isGroup: false, cashFlowClass: "OPERATING" as const },
];

const ITEMS = [
  { code: "COPPERSCRAP", nameEn: "Copper Scrap", nameAr: "خردة نحاس", unit: "KG" as const, defaultRate: 2500 },
  { code: "ALUMINSCRAP", nameEn: "Aluminium Scrap", nameAr: "خردة ألومنيوم", unit: "KG" as const, defaultRate: 650 },
  { code: "BRASSSCRAPO", nameEn: "Brass Scrap", nameAr: "خردة نحاس أصفر", unit: "KG" as const, defaultRate: 1800 },
  { code: "CABLESCRAPS", nameEn: "Cable & Wire", nameAr: "كابلات وأسلاك", unit: "KG" as const, defaultRate: 900 },
  { code: "OLDIRONSTEL", nameEn: "Old Iron / Steel", nameAr: "حديد وصلب قديم", unit: "TON" as const, defaultRate: 120000 },
  { code: "CARBATTERIE", nameEn: "Car Batteries", nameAr: "بطاريات سيارات", unit: "PCS" as const, defaultRate: 500 },
  { code: "CARTONBOXESP", nameEn: "Carton Boxes", nameAr: "كرتون", unit: "KG" as const, defaultRate: 45 },
  { code: "RADIATORSOLD", nameEn: "Old Radiators", nameAr: "مشعات قديمة", unit: "KG" as const, defaultRate: 700 },
];

const PARTIES = [
  { code: "CUST-001", type: "CUSTOMER" as const, nameEn: "Emirates Metal Trading LLC", nameAr: "الإمارات للتجارة معادن ذ.م.م", trn: "100123456700003" },
  { code: "CUST-002", type: "CUSTOMER" as const, nameEn: "Dubai Recycle Center LLC", nameAr: "مركز دبي لإعادة التدوير ذ.م.م", trn: "100234567800003" },
  { code: "CUST-003", type: "CUSTOMER" as const, nameEn: "Al Noor Scrap Trading", nameAr: "النور لتجارة الخردة", trn: "100345678900003" },
  { code: "CUST-004", type: "CUSTOMER" as const, nameEn: "Union Metals Sharjah", nameAr: "الاتحاد للمعادن الشارقة", trn: "100456789000003" },
  { code: "CUST-005", type: "CUSTOMER" as const, nameEn: "Green Cycle FZE", nameAr: "جرين سايكل للمناطق الحرة", trn: "100567890100003" },
  { code: "CUST-006", type: "CUSTOMER" as const, nameEn: "Abraj Scrap Trading Est", nameAr: "أبراج لتجارة الخردة", trn: "100678901200003" },
  { code: "VEND-001", type: "VENDOR" as const, nameEn: "Sharjah Junk Traders", nameAr: "تجار خردة الشارقة", trn: "100765432100003" },
  { code: "VEND-002", type: "VENDOR" as const, nameEn: "Ras Al Khor Recycling", nameAr: "رأس الخور لإعادة التدوير", trn: "100876543200003" },
  { code: "VEND-003", type: "VENDOR" as const, nameEn: "Ajman Waste Handlers", nameAr: "متعاملو نفايات عجمان", trn: "100987654300003" },
  { code: "VEND-004", type: "VENDOR" as const, nameEn: "Delta Scrap Trading Co Ltd", nameAr: "دلتا لتجارة الخردة ذ.م.م", trn: "" },
  { code: "VEND-005", type: "VENDOR" as const, nameEn: "Al Ain Metal Collectors", nameAr: "مجمع معدني العين", trn: "100198765400003" },
];

const SALES_DAYS = [72, 68, 63, 57, 52, 47, 42, 36, 31, 25, 19, 13, 8, 4];
const PURCHASE_DAYS = [70, 59, 48, 37, 23, 12, 6];
const SALE_ITEMS = ITEMS.map((i) => i.code);
const PURCHASE_ITEMS = ["COPPERSCRAP", "ALUMINSCRAP", "CABLESCRAPS", "OLDIRONSTEL", "CARBATTERIE", "BRASSSCRAPO", "CARTONBOXESP"];

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function ensureBase(tx: Tx): Promise<{ accById: (code: string) => string }> {
  await tx.companySettings.upsert({ where: { id: "settings" }, update: {}, create: { id: "settings" } });
  await tx.fiscalYear.upsert({
    where: { name: "FY2026" },
    update: {},
    create: { name: "FY2026", starts: new Date("2026-01-01"), ends: new Date("2026-12-31"), status: "OPEN" },
  });

  const codeToId = new Map<string, string>();
  for (const row of COA) {
    const existing = await tx.account.findUnique({ where: { code: row.code } });
    if (existing) { codeToId.set(row.code, existing.id); continue; }
    const created = await tx.account.create({ data: row });
    codeToId.set(row.code, created.id);
  }

  await tx.user.upsert({
    where: { email: "admin@maxsolbiz.com" },
    update: {},
    create: { name: "Admin", email: "admin@maxsolbiz.com", passwordHash: await hash("Start@123", 12), role: "ADMIN" },
  });

  for (const item of ITEMS) {
    await tx.item.upsert({ where: { code: item.code }, update: {}, create: item });
  }
  for (const p of PARTIES) {
    await tx.party.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  return { accById: (code: string) => codeToId.get(code)! };
}

export async function seedDemoData(
  client: PrismaClient = prisma,
): Promise<DemoResult> {
  const run = async (tx: Tx): Promise<DemoResult> => {
    const { accById } = await ensureBase(tx);
    const admin = await tx.user.findUniqueOrThrow({ where: { email: "admin@maxsolbiz.com" }, select: { id: true } });

    const items = await tx.item.findMany({ where: { code: { in: ITEMS.map((i) => i.code) } } });
    const itemByCode = new Map(items.map((i) => [i.code, i]));
    const parties = await tx.party.findMany({ where: { code: { in: PARTIES.map((p) => p.code) } } });
    const partyByCode = new Map(parties.map((p) => [p.code, p]));

    const rng = makeRng(20261018);
    const jitter = (rateFils: number, pct: number) =>
      BigInt(Math.max(1, Math.round(rateFils * (1 + (rng() * 2 - 1) * pct))));

    const custCodes = PARTIES.filter((p) => p.type === "CUSTOMER").map((p) => p.code);
    const vendCodes = PARTIES.filter((p) => p.type === "VENDOR").map((p) => p.code);

    async function makeInvoice(direction: InvoiceDirection, daysAgo: number, partyCode: string, itemCodes: string[]) {
      const lines = itemCodes.map((code) => {
        const item = itemByCode.get(code);
        if (!item) throw new Error(`Demo item ${code} missing`);
        const span = item.unit === "TON" ? [8, 14] : item.unit === "PCS" ? [40, 220] : [300, 2400];
        return {
          itemId: item.id,
          description: item.nameEn,
          descriptionAr: item.nameAr,
          qty: String(Math.round(span[0] + rng() * (span[1] - span[0]))),
          unit: item.unit,
          rateFils: jitter(Number(item.defaultRate), 0.08),
          vatRate: 0.05,
        };
      });
      return createInvoice({
        tx,
        direction,
        date: dateDaysAgo(daysAgo),
        partyId: partyByCode.get(partyCode)!.id,
        notes: "Demo data — seeded for testing",
        notesAr: "بيانات تجريبية مُنشأة للاختبار",
        lines,
        createdById: admin.id,
      });
    }

    const saleIds: string[] = [];
    const purchaseIds: string[] = [];
    for (let i = 0; i < SALES_DAYS.length; i++) {
      const picks = 1 + Math.floor(rng() * 2);
      const itemCodes = [...SALE_ITEMS].sort(() => rng() - 0.5).slice(0, picks);
      const inv = await makeInvoice("SALES", SALES_DAYS[i], custCodes[i % custCodes.length], itemCodes);
      saleIds.push(inv.id);
    }
    for (let i = 0; i < PURCHASE_DAYS.length; i++) {
      const picks = 1 + Math.floor(rng() * 2);
      const itemCodes = [...PURCHASE_ITEMS].sort(() => rng() - 0.5).slice(0, picks);
      const inv = await makeInvoice("PURCHASE", PURCHASE_DAYS[i], vendCodes[i % vendCodes.length], itemCodes);
      purchaseIds.push(inv.id);
    }

    async function settle(invoiceId: string, ratio: number, type: "RECEIPT" | "PAYMENT") {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const amount = (inv.totalFils * BigInt(Math.round(ratio * 100))) / 100n;
      await createPayment({
        tx,
        type,
        method: rng() > 0.5 ? "BANK" : "CASH",
        date: new Date(Math.min(Date.now(), inv.date.getTime() + 10 * 86400000) - 43200000),
        partyId: inv.partyId,
        amountFils: amount,
        allocations: [{ invoiceId, amountFils: amount }],
        createdById: admin.id,
      });
      return amount;
    }

    for (const id of saleIds.slice(0, 5)) await settle(id, 1, "RECEIPT");
    await settle(saleIds[5], 0.6, "RECEIPT");
    await settle(saleIds[6], 0.35, "RECEIPT");
    await settle(purchaseIds[0], 1, "PAYMENT");
    await settle(purchaseIds[1], 1, "PAYMENT");
    await settle(purchaseIds[2], 1, "PAYMENT");
    await settle(purchaseIds[3], 0.5, "PAYMENT");

    await createPayment({
      tx, type: "RECEIPT", method: "BANK", date: dateDaysAgo(3),
      partyId: partyByCode.get("CUST-002")!.id, amountFils: 500000n,
      allocations: [], createdById: admin.id,
      notes: "Advance from customer (unallocated)",
    });
    await createPayment({
      tx, type: "CONTRA", method: "BANK", date: dateDaysAgo(2),
      amountFils: 2000000n, allocations: [], createdById: admin.id,
      notes: "Bank to cash withdrawal",
    });

    await postJournalEntry({
      tx, date: new Date("2026-01-02T12:00:00"), sourceType: "OPENING_BALANCE",
      narration: "Opening balances — FY2026", narrationAr: "الأرصدة الافتتاحية — 2026",
      createdById: admin.id,
      lines: [
        { accountId: accById("1110"), debit: 5000000n, description: "Opening cash" },
        { accountId: accById("1120"), debit: 15000000n, description: "Opening bank" },
        { accountId: accById("1510"), debit: 8000000n, description: "Opening equipment" },
        { accountId: accById("3100"), credit: 28000000n, description: "Owner's capital" },
      ],
    });
    await postJournalEntry({
      tx, date: dateDaysAgo(40), sourceType: "MANUAL",
      narration: "September rent", narrationAr: "إيجار سبتمبر",
      createdById: admin.id,
      lines: [
        { accountId: accById("5300"), debit: 2200000n, description: "Warehouse rent" },
        { accountId: accById("1120"), credit: 2200000n, description: "Bank transfer" },
      ],
    });
    await postJournalEntry({
      tx, date: dateDaysAgo(30), sourceType: "MANUAL",
      narration: "Salary accrual — September", narrationAr: "استحقاق رواتب — سبتمبر",
      createdById: admin.id,
      lines: [
        { accountId: accById("5200"), debit: 1750000n, description: "Staff salaries" },
        { accountId: accById("2200"), credit: 1750000n, description: "Salaries payable" },
      ],
    });
    await postJournalEntry({
      tx, date: dateDaysAgo(20), sourceType: "MANUAL",
      narration: "Transport fuel and bank charges", narrationAr: "وقود النقل ومصاريف بنكية",
      createdById: admin.id,
      lines: [
        { accountId: accById("5500"), debit: 480000n, description: "Diesel for trucks" },
        { accountId: accById("5600"), debit: 12000n, description: "Bank charges" },
        { accountId: accById("1120"), credit: 492000n },
      ],
    });

    return {
      accounts: COA.length,
      items: ITEMS.length,
      parties: PARTIES.length,
      salesInvoices: saleIds.length,
      purchaseInvoices: purchaseIds.length,
      payments: 10,
      journals: 4,
    };
  };

  return client.$transaction(run, { timeout: 60000 });
}

/** Wipes all transactional data (invoices, payments, journals, serials, audit), then re-seeds the demo dataset. */
export async function resetDemoData(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.paymentAllocation.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.invoiceLine.deleteMany({});
    await tx.invoice.deleteMany({});
    await tx.journalLine.deleteMany({});
    await tx.journalEntry.deleteMany({});
    await tx.serial.deleteMany({});
    await tx.auditLog.deleteMany({});
  }, { timeout: 60000 });
  await seedDemoData();
}
