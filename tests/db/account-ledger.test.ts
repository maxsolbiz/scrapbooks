import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { accountLedger } from "@/lib/reports";
import { signFor } from "@/lib/accounting";
import { postJournalEntry } from "@/lib/accounting";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("P1.5(b): accountLedger signFor", () => {
  it("signFor returns positive balance for CREDIT-normal account with credit entry", async () => {
    const account = await prisma.account.findUnique({ where: { code: "4100" } });
    expect(account).toBeDefined();
    expect(account?.normalBalance).toBe("CREDIT");

    // signFor(CREDIT, 0n, 100000n) should return positive 100000n (credit increases credit-normal balance)
    expect(signFor("CREDIT", 0n, 100000n)).toBe(100000n);
    // signFor(CREDIT, 50000n, 0n) should return negative 50000n (debit decreases credit-normal balance)
    expect(signFor("CREDIT", 50000n, 0n)).toBe(-50000n);
  });

  it("signFor returns positive balance for DEBIT-normal account with debit entry", async () => {
    expect(signFor("DEBIT", 100000n, 0n)).toBe(100000n);
    expect(signFor("DEBIT", 0n, 50000n)).toBe(-50000n);
  });

  it("accountLedger running balance is positive for CREDIT account after credit posting", async () => {
    const fy = await prisma.fiscalYear.findFirst({ where: { name: "FY2026" } });
    expect(fy).toBeDefined();

    const revenueAcc = await prisma.account.findUnique({ where: { code: "4100" } });
    expect(revenueAcc).toBeDefined();
    expect(revenueAcc?.normalBalance).toBe("CREDIT");

    await prisma.$transaction(async (tx) => {
      await postJournalEntry({
        tx,
        date: new Date("2026-03-15"),
        narration: "Revenue entry",
        sourceType: "MANUAL",
        createdById: ctx.userId,
        lines: [
          { accountId: revenueAcc!.id, credit: 500000n },
          { accountId: (await prisma.account.findUnique({ where: { code: "1130" } }))!.id, debit: 500000n },
        ],
      });
    });

    const result = await accountLedger(revenueAcc!.id, fy!);
    expect(result.endingBalance).toBe(500000n);
    expect(result.startingBalance).toBe(0n);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].balance).toBe(500000n);
  });
});
