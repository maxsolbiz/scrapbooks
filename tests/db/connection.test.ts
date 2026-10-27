import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { harness } from "./helpers";

describe("worker connection ground truth", () => {
  it("worker is connected to the validated TEST database", async () => {
    expect(harness.guard.test.database).toMatch(/_test$/);
    const rows = (await prisma.$queryRawUnsafe<{ current_database: string }[]>(
      "SELECT current_database()",
    )) as unknown as { current_database: string }[];
    expect(rows[0].current_database).toBe(harness.guard.test.database);
  });
});
