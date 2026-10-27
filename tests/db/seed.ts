import { hash } from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { COA } from "../../prisma/coa";

export interface TestContext {
  userId: string;
  fiscalYearName: string;
  accountByCode: Map<string, string>;
  customerId: string;
  vendorId: string;
  customerName: string;
  customerNameAr: string;
}

/**
 * Seeds the minimal posting context. Uses the canonical COA from prisma/coa.ts
 * (single source of truth — never hand-duplicated) with FIXED account codes,
 * because payment posting looks accounts up by code (1110/1120/1130/2100).
 * Cleanliness relies on truncateAll() (Mode B) — not on name suffixes.
 */
export async function seedTestData(client: PrismaClient): Promise<TestContext> {
  const user = await client.user.create({
    data: {
      name: "Test Admin",
      email: "admin@test.local",
      passwordHash: await hash("test-password", 4),
      role: "ADMIN",
    },
  });
  const fy = await client.fiscalYear.create({
    data: { name: "FY2026", starts: new Date("2026-01-01"), ends: new Date("2026-12-31"), status: "OPEN" },
  });

  const accountByCode = new Map<string, string>();
  for (const row of COA) {
    const created = await client.account.create({
      data: {
        code: row.code,
        nameEn: row.nameEn,
        nameAr: row.nameAr,
        type: row.type,
        normalBalance: row.normalBalance,
        isGroup: row.group ?? false,
        cashFlowClass: row.cashFlow ?? "NONE",
      },
    });
    accountByCode.set(row.code, created.id);
  }
  for (const row of COA) {
    if (!row.parentCode) continue;
    await client.account.update({
      where: { id: accountByCode.get(row.code)! },
      data: { parentId: accountByCode.get(row.parentCode)! },
    });
  }

  const customer = await client.party.create({
    data: { code: "CUST-001", type: "CUSTOMER", nameEn: "Test Customer", nameAr: "عميل اختبار", trn: "100000000000003" },
  });
  const vendor = await client.party.create({
    data: { code: "VEND-001", type: "VENDOR", nameEn: "Test Vendor", nameAr: "مورد اختبار", trn: "200000000000003" },
  });

  return {
    userId: user.id,
    fiscalYearName: fy.name,
    accountByCode,
    customerId: customer.id,
    vendorId: vendor.id,
    customerName: customer.nameEn,
    customerNameAr: customer.nameAr,
  };
}
