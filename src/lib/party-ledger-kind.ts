export type PartyLedgerKind =
  | "INVOICE"
  | "PURCHASE_INVOICE"
  | "RECEIPT"
  | "PAYMENT"
  | "REVERSAL"
  | "JOURNAL"
  | "OPENING"
  | "YEAR_END";

export function partyLedgerKind(
  sourceType: string,
  hasInvoice: boolean,
  hasPayment: boolean,
): PartyLedgerKind {
  if (sourceType === "REVERSAL") return "REVERSAL";
  if (hasInvoice) {
    return sourceType === "PURCHASE_INVOICE" ? "PURCHASE_INVOICE" : "INVOICE";
  }
  if (hasPayment) {
    return sourceType === "RECEIPT" ? "RECEIPT" : "PAYMENT";
  }
  if (sourceType === "OPENING_BALANCE") return "OPENING";
  if (sourceType === "YEAR_END_CLOSE") return "YEAR_END";
  return "JOURNAL";
}

export function partyLedgerHref(kind: PartyLedgerKind, docId: string): string {
  switch (kind) {
    case "INVOICE":
      return `/sales-invoices/${docId}`;
    case "PURCHASE_INVOICE":
      return `/purchase-invoices/${docId}`;
    case "RECEIPT":
    case "PAYMENT":
      return `/payments/${docId}`;
    case "REVERSAL":
    case "JOURNAL":
    case "OPENING":
    case "YEAR_END":
      return `/journals/${docId}`;
  }
}

export function partyLedgerLabelKey(kind: PartyLedgerKind): string {
  switch (kind) {
    case "INVOICE": return "invoice";
    case "PURCHASE_INVOICE": return "purchaseInvoice";
    case "RECEIPT": return "receipt";
    case "PAYMENT": return "payment";
    case "REVERSAL": return "reversal";
    case "JOURNAL": return "journal";
    case "OPENING": return "opening";
    case "YEAR_END": return "yearEnd";
  }
}