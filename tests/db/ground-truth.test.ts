import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { truncateAll, assertCurrentDatabase, harness } from "./helpers";
import { seedTestData } from "./seed";

// Negative test for the GROUND-TRUTH ABORT (reviewer-mandated): proves truncateAll
// refuses when the harness context names a different database AND that the data
// survives the refusal (no TRUNCATE was sent).
describe("ground-truth abort (truncateAll safety)", () => {
  it("tampered harness context: truncateAll and assertCurrentDatabase reject /GROUND TRUTH MISMATCH/ and seeded rows survive", async () => {
    await truncateAll(prisma); // clean slate; this runs the guarded path
    await seedTestData(prisma);
    const usersBefore = await prisma.user.count();
    expect(usersBefore).toBeGreaterThan(0);

    const original = harness.guard;
    try {
      harness.guard = {
        ...original,
        test: { ...original.test, database: "not_the_validated_test_db" },
      };

      await expect(assertCurrentDatabase(prisma)).rejects.toThrow(/GROUND TRUTH MISMATCH/);
      await expect(truncateAll(prisma)).rejects.toThrow(/GROUND TRUTH MISMATCH/);

      // Data survives — truncateAll threw BEFORE the TRUNCATE statement.
      expect(await prisma.user.count()).toBe(usersBefore);
    } finally {
      harness.guard = original; // always restore
    }

    // After restore the normal path works (proves the abort was contextual).
    await expect(truncateAll(prisma)).resolves.toBeUndefined();
    expect(await prisma.user.count()).toBe(0);
  });
});
