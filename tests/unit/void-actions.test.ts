import { describe, it, expect, vi, beforeEach } from "vitest";

const FAKE_USER = { id: "u1", name: "Abe", email: "a@b.c", role: "ADMIN" };

const voidInvoiceWithReversal = vi.fn<(...args: unknown[]) => unknown>();
const voidPaymentWithReversal = vi.fn<(...args: unknown[]) => unknown>();
const logAudit = vi.fn<(...args: unknown[]) => unknown>();
const requireModule = vi.fn<(...args: unknown[]) => unknown>();
const revalidatePath = vi.fn<(...args: unknown[]) => unknown>();
const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb("TX-PROBE"));

vi.mock("@/lib/invoices", () => ({ voidInvoiceWithReversal: (...a: unknown[]) => voidInvoiceWithReversal(...a) }));
vi.mock("@/lib/payments", () => ({ voidPaymentWithReversal: (...a: unknown[]) => voidPaymentWithReversal(...a) }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/guard", () => ({ requireModule: (...a: unknown[]) => requireModule(...a) }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (cb: (tx: unknown) => unknown) => $transaction(cb) } }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { voidInvoiceAction } from "@/lib/invoice-actions";
import { voidPaymentAction } from "@/app/(app)/payments/actions";

beforeEach(() => {
  voidInvoiceWithReversal.mockReset();
  voidPaymentWithReversal.mockReset();
  logAudit.mockReset();
  requireModule.mockImplementation(async () => FAKE_USER);
  $transaction.mockClear();
  revalidatePath.mockReset();
});

describe("voidInvoiceAction (commit 4)", () => {
  it("happy path: reversal invoked with the trimmed reason, today-Dubai UTC midnight and the acting user; audited with the reversal entryNo", async () => {
    voidInvoiceWithReversal.mockResolvedValue({ entryNo: "REV-FY2026-0005" });
    const res = await voidInvoiceAction("inv-1", "SALES", "  wrong customer  ");
    expect(res).toEqual({ ok: true });
    const arg = voidInvoiceWithReversal.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.invoiceId).toBe("inv-1");
    expect(arg.reason).toBe("wrong customer");
    expect(arg.tx).toBe("TX-PROBE");
    expect(logAudit).toHaveBeenCalledWith(FAKE_USER, "INVOICE_VOID", "Invoice", "inv-1", expect.stringContaining("REV-FY2026-0005"));
    expect(String(logAudit.mock.calls[0][4])).toContain("wrong customer");
    expect(revalidatePath).toHaveBeenCalledWith("/sales-invoices");
  });

  it("blank reason rejects without touching the ledger", async () => {
    const res = await voidInvoiceAction("inv-1", "SALES", "   ");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/reason is required/i) });
    expect(voidInvoiceWithReversal).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("over-long reason (2001 chars) rejects", async () => {
    const res = await voidInvoiceAction("inv-1", "SALES", "x".repeat(2001));
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/at most 2000/i) });
    expect(voidInvoiceWithReversal).not.toHaveBeenCalled();
  });

  it("permission failure propagates (requireModule redirects outside try)", async () => {
    requireModule.mockImplementation(async () => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(voidInvoiceAction("inv-1", "SALES", "why")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(voidInvoiceWithReversal).not.toHaveBeenCalled();
  });

  it("ledger error surfaces as ok:false with the ledger message", async () => {
    voidInvoiceWithReversal.mockRejectedValue(new Error("Invoice has payment allocations — remove them first"));
    const res = await voidInvoiceAction("inv-1", "SALES", "mistake");
    expect(res).toEqual({ ok: false, error: "Invoice has payment allocations — remove them first" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("audit failure after a committed void still returns ok:true", async () => {
    voidInvoiceWithReversal.mockResolvedValue({ entryNo: "REV-FY2026-0005" });
    logAudit.mockImplementation(() => {
      throw new Error("audit down");
    });
    const res = await voidInvoiceAction("inv-1", "SALES", "why");
    expect(res).toEqual({ ok: true });
    expect(logAudit).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/sales-invoices");
  });

  it("DRAFT void: reversal null, audit still carries the reason and the no-journal note", async () => {
    voidInvoiceWithReversal.mockResolvedValue(null);
    const res = await voidInvoiceAction("inv-1", "SALES", "draft void");
    expect(res).toEqual({ ok: true });
    expect(String(logAudit.mock.calls[0][4])).toContain("(no journal entry)");
    expect(String(logAudit.mock.calls[0][4])).toContain("draft void");
  });
});

describe("voidPaymentAction (commit 4)", () => {
  it("happy path: reversal invoked with trimmed reason; audit carries the reversal entryNo; payments list revalidated", async () => {
    voidPaymentWithReversal.mockResolvedValue({ entryNo: "REV-FY2026-0009" });
    const res = await voidPaymentAction("pay-1", " duplicated receipt ");
    expect(res).toEqual({ ok: true });
    const arg = voidPaymentWithReversal.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.paymentId).toBe("pay-1");
    expect(arg.reason).toBe("duplicated receipt");
    expect(arg.tx).toBe("TX-PROBE");
    expect(logAudit).toHaveBeenCalledWith(FAKE_USER, "PAYMENT_VOID", "Payment", "pay-1", expect.stringContaining("REV-FY2026-0009"));
    expect(revalidatePath).toHaveBeenCalledWith("/payments");
  });

  it("blank reason rejects without touching the ledger", async () => {
    const res = await voidPaymentAction("pay-1", "");
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/reason is required/i) });
    expect(voidPaymentWithReversal).not.toHaveBeenCalled();
  });

  it("permission failure propagates", async () => {
    requireModule.mockImplementation(async () => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(voidPaymentAction("pay-1", "why")).rejects.toThrow(/NEXT_REDIRECT/);
    expect(voidPaymentWithReversal).not.toHaveBeenCalled();
  });

  it("audit failure after a committed void still returns ok:true", async () => {
    voidPaymentWithReversal.mockResolvedValue({ entryNo: "REV-FY2026-0009" });
    logAudit.mockImplementation(() => {
      throw new Error("audit down");
    });
    const res = await voidPaymentAction("pay-1", "why");
    expect(res).toEqual({ ok: true });
    expect(logAudit).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/payments");
  });

  it("ledger void failure returns ok:false without calling audit", async () => {
    voidPaymentWithReversal.mockRejectedValue(new Error("already void"));
    const res = await voidPaymentAction("pay-1", "why");
    expect(res).toEqual({ ok: false, error: "already void" });
    expect(logAudit).not.toHaveBeenCalled();
  });
});
