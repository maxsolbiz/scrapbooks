import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { partyLedger } from "@/lib/reports";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P1.5(c): partyLedger kind/href mapping (F13)", () => {
  it("MANUAL journal entries are labeled JOURNAL (not PAYMENT)", async () => {
    const fy = await prisma.fiscalYear.findFirst({ where: { name: "FY2026" } });
    expect(fy).toBeDefined();

    await prisma.$transaction(async (tx) => {
      await (await import("@/lib/accounting")).postJournalEntry({
        tx,
        date: new Date("2026-03-15"),
        narration: "Manual entry",
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: [
          { accountId: (await prisma.account.findUnique({ where: { code: "1130" } }))!.id, debit: 100000n, partyId: ctx.customerId },
          { accountId: (await prisma.account.findUnique({ where: { code: "1130" } }))!.id, credit: 100000n },
        ],
      });
    });

    const rows = await partyLedger(ctx.customerId, fy!);
    const manualRow = rows.find((r) => r.kind === "JOURNAL" || r.kind === "PAYMENT");
    expect(manualRow?.kind).toBe("JOURNAL");
  });
});
