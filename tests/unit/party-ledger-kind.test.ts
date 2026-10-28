import { describe, it, expect } from "vitest";
import { partyLedgerKind, partyLedgerHref } from "@/lib/party-ledger-kind";
import { getDictionary } from "@/lib/i18n";

const en = getDictionary("en");
const ar = getDictionary("ar");

describe("partyLedgerKind mapping", () => {
  it("maps sourceType + hasInvoice + hasPayment to the right kind", () => {
    expect(partyLedgerKind("REVERSAL", false, false)).toBe("REVERSAL");
    expect(partyLedgerKind("SALES_INVOICE", true, false)).toBe("INVOICE");
    expect(partyLedgerKind("PURCHASE_INVOICE", true, false)).toBe("PURCHASE_INVOICE");
    expect(partyLedgerKind("RECEIPT", false, true)).toBe("RECEIPT");
    expect(partyLedgerKind("PAYMENT", false, true)).toBe("PAYMENT");
    expect(partyLedgerKind("MANUAL", false, false)).toBe("JOURNAL");
    expect(partyLedgerKind("OPENING_BALANCE", false, false)).toBe("OPENING");
    expect(partyLedgerKind("YEAR_END_CLOSE", false, false)).toBe("YEAR_END");
  });

  it("falls back to JOURNAL when the document row is missing", () => {
    expect(partyLedgerKind("SALES_INVOICE", false, false)).toBe("JOURNAL");
    expect(partyLedgerKind("PURCHASE_INVOICE", false, false)).toBe("JOURNAL");
    expect(partyLedgerKind("RECEIPT", false, false)).toBe("JOURNAL");
    expect(partyLedgerKind("PAYMENT", false, false)).toBe("JOURNAL");
  });

  it("maps unknown sourceType to JOURNAL", () => {
    expect(partyLedgerKind("UNKNOWN_SOURCE" as any, false, false)).toBe("JOURNAL");
  });
});

describe("partyLedgerHref mapping", () => {
  it("links each kind to the right route", () => {
    expect(partyLedgerHref("INVOICE", "inv-123")).toBe("/sales-invoices/inv-123");
    expect(partyLedgerHref("PURCHASE_INVOICE", "inv-123")).toBe("/purchase-invoices/inv-123");
    expect(partyLedgerHref("RECEIPT", "pay-123")).toBe("/payments/pay-123");
    expect(partyLedgerHref("PAYMENT", "pay-123")).toBe("/payments/pay-123");
    expect(partyLedgerHref("REVERSAL", "rev-123")).toBe("/journals/rev-123");
    expect(partyLedgerHref("JOURNAL", "jnl-123")).toBe("/journals/jnl-123");
    expect(partyLedgerHref("OPENING", "jnl-123")).toBe("/journals/jnl-123");
    expect(partyLedgerHref("YEAR_END", "jnl-123")).toBe("/journals/jnl-123");
  });

  it("never links to /payments/ except for RECEIPT and PAYMENT", () => {
    const kinds: Array<"INVOICE" | "PURCHASE_INVOICE" | "RECEIPT" | "PAYMENT" | "REVERSAL" | "JOURNAL" | "OPENING" | "YEAR_END"> = [
      "INVOICE",
      "PURCHASE_INVOICE",
      "RECEIPT",
      "PAYMENT",
      "REVERSAL",
      "JOURNAL",
      "OPENING",
      "YEAR_END",
    ];
    for (const kind of kinds) {
      const href = partyLedgerHref(kind, "x-1");
      const isPaymentKind = kind === "RECEIPT" || kind === "PAYMENT";
      expect(href.startsWith("/payments/")).toBe(isPaymentKind);
    }
  });
});

describe("i18n kind labels", () => {
  const kinds: Array<"INVOICE" | "PURCHASE_INVOICE" | "RECEIPT" | "PAYMENT" | "REVERSAL" | "JOURNAL" | "OPENING" | "YEAR_END"> = [
    "INVOICE",
    "PURCHASE_INVOICE",
    "RECEIPT",
    "PAYMENT",
    "REVERSAL",
    "JOURNAL",
    "OPENING",
    "YEAR_END",
  ];

  const labelKeys: Record<string, string[]> = {
    INVOICE: ["partyLedgerKind", "invoice"],
    PURCHASE_INVOICE: ["partyLedgerKind", "purchaseInvoice"],
    RECEIPT: ["partyLedgerKind", "receipt"],
    PAYMENT: ["partyLedgerKind", "payment"],
    REVERSAL: ["partyLedgerKind", "reversal"],
    JOURNAL: ["partyLedgerKind", "journal"],
    OPENING: ["partyLedgerKind", "opening"],
    YEAR_END: ["partyLedgerKind", "yearEnd"],
  };

  function getLabel(dict: any, path: string[]): any {
    let node: any = dict;
    for (const part of path) {
      if (node && typeof node === "object") node = node[part];
      else return undefined;
    }
    return node;
  }

  it("each kind has an EN and AR label", () => {
    for (const kind of kinds) {
      const path = labelKeys[kind];
      const enLabel = getLabel(en, path);
      const arLabel = getLabel(ar, path);
      expect(enLabel, `${kind} EN label`).toBeDefined();
      expect(enLabel, `${kind} EN label`).toBeTruthy();
      expect(arLabel, `${kind} AR label`).toBeDefined();
      expect(arLabel, `${kind} AR label`).toBeTruthy();
    }
  });

  it("EN and AR labels differ between languages", () => {
    for (const kind of kinds) {
      const path = labelKeys[kind];
      const enLabel = getLabel(en, path);
      const arLabel = getLabel(ar, path);
      expect(enLabel).not.toBe(arLabel);
    }
  });

  it("AR labels contain only Arabic script", () => {
    const arabicRegex = /[\u0600-\u06FF]/;
    for (const kind of kinds) {
      const path = labelKeys[kind];
      const arLabel = getLabel(ar, path);
      expect(arLabel).toMatch(arabicRegex);
      expect(arLabel).not.toContain("?");
      expect(arLabel).not.toContain("\ufffd");
    }
  });
});