import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { truncateAll } from "./helpers";
import { seedTestData, type TestContext } from "./seed";

let ctx: TestContext;

beforeEach(async () => {
  await truncateAll(prisma);
  ctx = await seedTestData(prisma);
});

describe("idempotency keys (P1.8)", () => {
  it("prisma client has invoice model", async () => {
    // Test if prisma.invoice exists
    expect(prisma.invoice).toBeDefined();
    expect(typeof prisma.invoice.findUnique).toBe("function");
  });

  it("transaction client has invoice model", async () => {
    await prisma.$transaction(async (tx) => {
      expect(tx.invoice).toBeDefined();
      expect(typeof tx.invoice.findUnique).toBe("function");
    });
  });
});