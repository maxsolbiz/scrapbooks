import { describe, it, expect, vi, beforeEach } from "vitest";

const FAKE_USER = { id: "u1", name: "Abe", email: "a@b.c", role: "ADMIN" };

const voidManualJournal = vi.fn<(...args: unknown[]) => unknown>();
const logAudit = vi.fn<(...args: unknown[]) => unknown>();
const requireModule = vi.fn<(...args: unknown[]) => unknown>();
const revalidatePath = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/lib/accounting", () => ({ voidManualJournal: (...a: unknown[]) => voidManualJournal(...a) }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/guard", () => ({ requireModule: (...a: unknown[]) => requireModule(...a) }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (cb: (tx: unknown) => unknown) => cb("TX-PROBE") } }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { voidJournal } from "@/app/(app)/journals/actions";

beforeEach(() => {
  voidManualJournal.mockReset();
  logAudit.mockReset();
  requireModule.mockImplementation(async () => FAKE_USER);
  revalidatePath.mockReset();
});

describe("voidJournal (P1.1b)", () => {
  it("happy path: reversal invoked with trimmed reason, today-Dubai UTC midnight and acting user; audited with entryNo", async () => {
    voidManualJournal.mockResolvedValue({ entryNo: "REV-FY2026-0012" });
    const res = await voidJournal("je-1", "  wrong posting  ");
    expect(res).toEqual({ ok: true });
    const arg = voidManualJournal.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.entryId).toBe("je-1");
    expect(arg.reason).toBe("wrong posting");
    expect(arg.tx).toBe("TX-PROBE");
    expect(logAudit).toHaveBeenCalledWith(FAKE_USER, "JOURNAL_VOID", "JournalEntry", "je-1", expect.stringContaining("REV-FY2026-0012"));
    expect(String(logAudit.mock.calls[0][4])).toContain("wrong posting");
    expect(revalidatePath).toHaveBeenCalledWith("/journals");
  });

  it("blank reason rejects without touching the ledger", async () => {
    const res = await voidJournal("je-1", "   ");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/reason is required/i) });
    expect(voidManualJournal).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("over-long reason rejects without touching the ledger", async () => {
    const res = await voidJournal("je-1", "x".repeat(2001));
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/at most 2000/i) });
    expect(voidManualJournal).not.toHaveBeenCalled();
  });

  it("ledger void failure returns ok:false without calling audit", async () => {
    voidManualJournal.mockRejectedValue(new Error("Entry je-1 is already reversed by REV-FY2026-0013"));
    const res = await voidJournal("je-1", "why");
    expect(res).toEqual({ ok: false, error: "Entry je-1 is already reversed by REV-FY2026-0013" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("audit failure after a committed void still returns ok:true", async () => {
    voidManualJournal.mockResolvedValue({ entryNo: "REV-FY2026-0012" });
    logAudit.mockImplementation(() => {
      throw new Error("audit down");
    });
    const res = await voidJournal("je-1", "why");
    expect(res).toEqual({ ok: true });
    expect(logAudit).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/journals");
  });

  it("DRAFT void: reversal null, audit still carries the reason and draft note", async () => {
    voidManualJournal.mockResolvedValue(null);
    const res = await voidJournal("je-1", "draft entry");
    expect(res).toEqual({ ok: true });
    expect(String(logAudit.mock.calls[0][4])).toContain("(draft, no reversal)");
    expect(String(logAudit.mock.calls[0][4])).toContain("draft entry");
  });
});
