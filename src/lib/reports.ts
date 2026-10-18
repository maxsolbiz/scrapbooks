import { prisma } from "@/lib/db";
import type { Account, FiscalYear } from "@/generated/prisma/client";

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
  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });
  const lines = await prisma.journalLine.findMany({
    where: { entry: { status: "POSTED", date: { lte: asOf } } },
    select: { accountId: true, debit: true, credit: true },
  });
  const map = new Map<string, { debit: bigint; credit: bigint }>();
  for (const l of lines) {
    const row = map.get(l.accountId) ?? { debit: 0n, credit: 0n };
    row.debit += l.debit ?? 0n;
    row.credit += l.credit ?? 0n;
    map.set(l.accountId, row);
  }
  return accounts
    .map((acc) => {
      const agg = map.get(acc.id) ?? { debit: 0n, credit: 0n };
      return {
        id: acc.id,
        code: acc.code,
        nameEn: acc.nameEn,
        nameAr: acc.nameAr,
        type: acc.type,
        debitTotal: agg.debit,
        creditTotal: agg.credit,
      };
    })
    .filter((r) => r.debitTotal !== 0n || r.creditTotal !== 0n);
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
    (acc, l) => acc + (l.debit ?? 0n) - (l.credit ?? 0n),
    0n,
  );
  let running = starting;
  const rows: AccountLedgerRow[] = lines.map((l) => {
    running += (l.debit ?? 0n) - (l.credit ?? 0n);
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
  kind: "INVOICE" | "PAYMENT";
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
    rows.push({
      date: l.entry.date.toISOString().slice(0, 10),
      kind: invoice ? "INVOICE" : "PAYMENT",
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
