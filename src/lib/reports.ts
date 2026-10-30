import { partyLedgerKind, type PartyLedgerKind } from "@/lib/party-ledger-kind";
import { partyLedgerHref, partyLedgerLabelKey } from "@/lib/party-ledger-kind";
import { prisma } from "@/lib/db";
import type { Account, FiscalYear } from "@/generated/prisma/client";
import { signFor } from "@/lib/accounting";
import { formatAED } from "@/lib/money";

export interface TrialBalanceRow {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: string;
  debitTotal: bigint;
  creditTotal: bigint;
}

export async function trialBalance(asOf: Date): Promise<TrialBalanceRow[]> {
  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    _sum: { debit: true, credit: true },
    where: { entry: { status: "POSTED", date: { lte: asOf } } },
  });
  const accountIds = grouped.map((g) => g.accountId);
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    orderBy: { code: "asc" },
  });
  const groupedMap = new Map(grouped.map((g) => [g.accountId, g]));
  const result: TrialBalanceRow[] = [];
  for (const acc of accounts) {
    const g = groupedMap.get(acc.id);
    if (!g) continue;
    const debit = g._sum.debit ?? 0n;
    const credit = g._sum.credit ?? 0n;
    if (debit !== 0n || credit !== 0n) {
      result.push({
        id: acc.id,
        code: acc.code,
        nameEn: acc.nameEn,
        nameAr: acc.nameAr,
        type: acc.type,
        debitTotal: debit,
        creditTotal: credit,
      });
    }
  }
  return result;
}

export interface AccountLedgerRow {
  date: string;
  entryNo: string;
  narration: string | null;
  debit: bigint;
  credit: bigint;
  balance: bigint;
}

export interface AccountLedgerResult {
  startingBalance: bigint;
  rows: AccountLedgerRow[];
  endingBalance: bigint;
}

export async function accountLedger(
  accountId: string,
  fiscalYear: FiscalYear,
): Promise<AccountLedgerResult> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const lines = await prisma.journalLine.findMany({
    where: {
      accountId,
      entry: { status: "POSTED", date: { gte: fiscalYear.starts, lte: fiscalYear.ends } },
    },
    orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
    include: {
      entry: { select: { entryNo: true, narration: true, date: true } },
    },
  });
  const before = await prisma.journalLine.findMany({
    where: { accountId, entry: { status: "POSTED", date: { lt: fiscalYear.starts } } },
    select: { debit: true, credit: true },
  });
  const starting = before.reduce(
    (acc, l) => acc + signFor(account.normalBalance, l.debit ?? 0n, l.credit ?? 0n),
    0n,
  );
  let running = starting;
  const rows: AccountLedgerRow[] = lines.map((l) => {
    running += signFor(account.normalBalance, l.debit ?? 0n, l.credit ?? 0n);
    return {
      date: l.entry.date.toISOString().slice(0, 10),
      entryNo: l.entry.entryNo,
      narration: l.entry.narration,
      debit: l.debit ?? 0n,
      credit: l.credit ?? 0n,
      balance: running,
    };
  });
  return { startingBalance: starting, rows, endingBalance: running };
}

export interface PartyLedgerRow {
  date: string;
  kind: PartyLedgerKind;
  docNo: string;
  docId: string;
  narration: string | null;
  debit: bigint;
  credit: bigint;
  balance: bigint;
}

export async function partyLedger(
  partyId: string,
  fiscalYear: FiscalYear,
): Promise<PartyLedgerRow[]> {
  const arIds = await prisma.account.findMany({
    where: { code: "1130" },
    select: { id: true },
  });
  const apIds = await prisma.account.findMany({
    where: { code: "2100" },
    select: { id: true },
  });
  const controlIds = [...arIds, ...apIds].map((a) => a.id);
  const lines = await prisma.journalLine.findMany({
    where: {
      partyId,
      account: { id: { in: controlIds } },
      entry: { status: "POSTED", date: { gte: fiscalYear.starts, lte: fiscalYear.ends } },
    },
    orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
    include: {
      entry: {
        select: {
          entryNo: true,
          narration: true,
          date: true,
          sourceType: true,
          invoiceFor: { select: { id: true, invoiceNo: true } },
          paymentFor: { select: { id: true, paymentNo: true } },
        },
      },
    },
  });
  let running = 0n;
  const rows: PartyLedgerRow[] = [];
  for (const l of lines) {
    running += (l.debit ?? 0n) - (l.credit ?? 0n);
    const invoice = l.entry.invoiceFor;
    const payment = l.entry.paymentFor;
    // F13 fixed: partyLedgerKind handles all source types (MANUAL -> JOURNAL,
    // OPENING_BALANCE -> OPENING, YEAR_END_CLOSE -> YEAR_END) via party-ledger-kind.ts.
    const kind = partyLedgerKind(l.entry.sourceType, !!invoice, !!payment);
    rows.push({
      date: l.entry.date.toISOString().slice(0, 10),
      kind,
      docNo: invoice?.invoiceNo ?? payment?.paymentNo ?? l.entry.entryNo,
      docId: invoice?.id ?? payment?.id ?? l.entryId,
      narration: l.entry.narration,
      debit: l.debit ?? 0n,
      credit: l.credit ?? 0n,
      balance: running,
    });
  }
  return rows;
}

export interface PLRow {
  account: Account;
  amount: bigint;
}

export async function profitAndLoss(
  fiscalYear: FiscalYear,
): Promise<{ revenue: PLRow[]; expenses: PLRow[]; revenueTotal: bigint; expenseTotal: bigint; net: bigint }> {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: { status: "POSTED", date: { gte: fiscalYear.starts, lte: fiscalYear.ends } },
      account: { type: { in: ["INCOME", "EXPENSE"] } },
    },
    include: { account: true },
  });
  const revenue = new Map<string, { account: Account; amount: bigint }>();
  const expenses = new Map<string, { account: Account; amount: bigint }>();
  for (const l of lines) {
    const bucket = l.account.type === "INCOME" ? revenue : expenses;
    const row = bucket.get(l.accountId) ?? { account: l.account, amount: 0n };
    if (l.account.type === "INCOME") {
      row.amount += (l.credit ?? 0n) - (l.debit ?? 0n);
    } else {
      row.amount += (l.debit ?? 0n) - (l.credit ?? 0n);
    }
    bucket.set(l.accountId, row);
  }
  const revenueRows = [...revenue.values()].filter((r) => r.amount !== 0n).sort((a, b) => a.account.code.localeCompare(b.account.code));
  const expenseRows = [...expenses.values()].filter((r) => r.amount !== 0n).sort((a, b) => a.account.code.localeCompare(b.account.code));
  const revenueTotal = revenueRows.reduce((acc, r) => acc + r.amount, 0n);
  const expenseTotal = expenseRows.reduce((acc, r) => acc + r.amount, 0n);
  return { revenue: revenueRows, expenses: expenseRows, revenueTotal, expenseTotal, net: revenueTotal - expenseTotal };
}

export interface BalanceSheetResult {
  assets: { account: Account; amount: bigint }[];
  liabilities: { account: Account; amount: bigint }[];
  equity: { account: Account; amount: bigint }[];
  assetsTotal: bigint;
  liabilitiesTotal: bigint;
  equityTotal: bigint;
  earnedEquity: bigint;
  grandTotal: bigint;
}

export async function balanceSheet(asOf: Date): Promise<BalanceSheetResult> {
  const lines = await prisma.journalLine.findMany({
    where: { entry: { status: "POSTED", date: { lte: asOf } }, account: { type: { in: ["ASSET", "LIABILITY", "EQUITY"] } } },
    include: { account: true },
  });
  const map = new Map<string, { account: Account; balancing: bigint }>();
  for (const l of lines) {
    const row = map.get(l.accountId) ?? { account: l.account, balancing: 0n };
    row.balancing += (l.debit ?? 0n) - (l.credit ?? 0n);
    map.set(l.accountId, row);
  }
  const assets: { account: Account; amount: bigint }[] = [];
  const liabilities: { account: Account; amount: bigint }[] = [];
  const equity: { account: Account; amount: bigint }[] = [];
  for (const row of map.values()) {
    const balancing = row.balancing;
    if (row.account.type === "ASSET") {
      if (balancing !== 0n) assets.push({ account: row.account, amount: balancing });
    } else if (row.account.type === "LIABILITY") {
      if (balancing !== 0n) liabilities.push({ account: row.account, amount: -balancing });
    } else {
      if (balancing !== 0n) equity.push({ account: row.account, amount: -balancing });
    }
  }
  assets.sort((a, b) => a.account.code.localeCompare(b.account.code));
  liabilities.sort((a, b) => a.account.code.localeCompare(b.account.code));
  equity.sort((a, b) => a.account.code.localeCompare(b.account.code));
  const assetsTotal = assets.reduce((acc, r) => acc + r.amount, 0n);
  const liabilitiesTotal = liabilities.reduce((acc, r) => acc + r.amount, 0n);
  const equityTotal = equity.reduce((acc, r) => acc + r.amount, 0n);
  const pl = await profitAndLossOfYearToDate(asOf);
  return {
    assets,
    liabilities,
    equity,
    assetsTotal,
    liabilitiesTotal,
    equityTotal,
    earnedEquity: pl.net,
    grandTotal: assetsTotal - (liabilitiesTotal + equityTotal + pl.net),
  };
}

/** Net profit for all posted activity until asOf in open fiscal years (for balance sheet) */
export async function profitAndLossOfYearToDate(asOf: Date) {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: { status: "POSTED", date: { lte: asOf } },
      account: { type: { in: ["INCOME", "EXPENSE"] } },
    },
    include: { account: { select: { type: true } } },
  });
  let revenueTotal = 0n;
  let expenseTotal = 0n;
  for (const l of lines) {
    if (l.account.type === "INCOME") revenueTotal += (l.credit ?? 0n) - (l.debit ?? 0n);
    else expenseTotal += (l.debit ?? 0n) - (l.credit ?? 0n);
  }
  return { revenueTotal, expenseTotal, net: revenueTotal - expenseTotal };
}

export interface AgingEntry {
  partyId: string;
  partyName: string;
  invoiceNo: string;
  invoiceDate: string;
  outstanding: bigint;
  d0_30: bigint;
  d31_60: bigint;
  d61_90: bigint;
  d90plus: bigint;
}

export interface InvoiceRegisterFilter {
  fromDate?: Date;
  toDate?: Date;
  partyId?: string;
  direction?: "SALES" | "PURCHASE" | "ALL";
  status?: "POSTED" | "VOID" | "ALL";
}

export interface InvoiceRegisterRow {
  id: string;
  invoiceNo: string;
  date: Date;
  partyName: string;
  direction: "SALES" | "PURCHASE";
  totalFils: bigint;
  paidFils: bigint;
  outstandingFils: bigint;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  status: "POSTED" | "VOID" | "DRAFT";
}

export async function getInvoiceRegister(filters: InvoiceRegisterFilter): Promise<InvoiceRegisterRow[]> {
  const where: any = {};
  if (filters.direction && filters.direction !== "ALL") {
    where.direction = filters.direction;
  }
  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters.partyId) {
    where.partyId = filters.partyId;
  }
  if (filters.fromDate || filters.toDate) {
    where.date = {};
    if (filters.fromDate) where.date.gte = filters.fromDate;
    if (filters.toDate) where.date.lte = filters.toDate;
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: [{ date: "desc" }, { invoiceNo: "desc" }],
    include: {
      party: { select: { nameEn: true, nameAr: true, code: true } },
      allocations: {
        where: { payment: { status: "POSTED" } },
        select: { amountFils: true },
      },
      deductions: { select: { amountFils: true } },
    },
  });

  const result: InvoiceRegisterRow[] = [];
  for (const inv of invoices) {
    const paidFils = inv.allocations.reduce((sum, a) => sum + a.amountFils, 0n);
    const deductionFils = inv.deductions.reduce((sum, d) => sum + d.amountFils, 0n);
    const netSettled = paidFils + deductionFils;
    const outstandingFils = inv.totalFils - netSettled;
    const status = await import("@/lib/invoice-status").then((m) => m.derivePaymentStatus(inv.totalFils, netSettled, inv.dueDate));
    result.push({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      partyName: inv.party.nameEn,
      direction: inv.direction as "SALES" | "PURCHASE",
      totalFils: inv.totalFils,
      paidFils,
      outstandingFils,
      paymentStatus: status,
      status: inv.status,
    });
  }
  return result;
}

export function invoiceRegisterToCsv(rows: InvoiceRegisterRow[]): string {
  const BOM = "\uFEFF";
  const headers = [
    "Date",
    "Invoice No",
    "Party",
    "Direction",
    "Total (AED)",
    "Paid (AED)",
    "Outstanding (AED)",
    "Payment Status",
    "Status",
  ];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map((h) => escape(h)).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date.toISOString().slice(0, 10),
        escape(r.invoiceNo),
        escape(r.partyName),
        r.direction,
        formatAED(r.totalFils),
        formatAED(r.paidFils),
        formatAED(r.outstandingFils),
        r.paymentStatus,
        r.status,
      ].join(","),
    );
  }
  return BOM + lines.join("\n");
}

export async function agingReport(direction: "SALES" | "PURCHASE"): Promise<AgingEntry[]> {
  const invoices = await prisma.invoice.findMany({
    where: { status: "POSTED", direction },
    orderBy: { date: "asc" },
    include: {
      party: { select: { nameEn: true, nameAr: true } },
      allocations: { include: { payment: { select: { status: true } } } },
    },
  });
  const today = new Date();
  const out: AgingEntry[] = [];
  for (const inv of invoices) {
    const allocated = inv.allocations
      .filter((a) => a.payment.status !== "VOID")
      .reduce((acc, a) => acc + a.amountFils, 0n);
    const outstanding = inv.totalFils - allocated;
    if (outstanding <= 0n) continue;
    const ageDays = Math.floor((today.getTime() - inv.date.getTime()) / 86_400_000);
    out.push({
      partyId: inv.partyId,
      partyName: inv.party.nameEn,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.date.toISOString().slice(0, 10),
      outstanding,
      d0_30: ageDays <= 30 ? outstanding : 0n,
      d31_60: ageDays > 30 && ageDays <= 60 ? outstanding : 0n,
      d61_90: ageDays > 60 && ageDays <= 90 ? outstanding : 0n,
      d90plus: ageDays > 90 ? outstanding : 0n,
    });
  }
  return out;
}
