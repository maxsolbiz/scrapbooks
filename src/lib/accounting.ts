import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { EntrySource } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/tx";

export const FILS_PER_AED = 100;

/** Calendar-date-only comparison key: the app stores dates as UTC midnight, so
 * "on/after" means the UTC YYYY-MM-DD string, never the raw timestamp. */
function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface PostLineInput {
  accountId: string;
  /** fils */
  debit?: bigint;
  /** fils */
  credit?: bigint;
  partyId?: string;
  description?: string;
}

export interface PostJournalInput {
  date: Date;
  narration?: string | null;
  narrationAr?: string | null;
  sourceType: EntrySource;
  sourceId?: string;
  createdById: string;
  lines: PostLineInput[];
  tx: Tx;
  /** Reversal path ONLY: skip the isActive check (a deactivated historic account
   * must not make a voidable document un-voidable). Normal posting never sets it. */
  allowInactive?: boolean;
}

const SOURCE_PREFIX: Record<string, string> = {
  MANUAL: "JV",
  SALES_INVOICE: "INV",
  PURCHASE_INVOICE: "PINV",
  PAYMENT: "PAY",
  RECEIPT: "RCP",
  OPENING_BALANCE: "OB",
  YEAR_END_CLOSE: "YEC",
  REVERSAL: "REV",
};

async function nextNumber(tx: Tx, key: string) {
  const serial = await tx.serial.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return serial.value;
}

export function assertBalanced(lines: PostLineInput[]) {
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines");
  }
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const line of lines) {
    const debit = line.debit ?? 0n;
    const credit = line.credit ?? 0n;
    if (debit < 0n || credit < 0n || (debit > 0n && credit > 0n)) {
      throw new Error("Each line must be exclusively a debit or a credit");
    }
    if (debit === 0n && credit === 0n) {
      throw new Error("Zero-value lines are not allowed");
    }
    totalDebit += debit;
    totalCredit += credit;
  }
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Entry is not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`,
    );
  }
}

export async function postJournalEntry(input: PostJournalInput) {
  const { tx, date, narration, narrationAr, sourceType, sourceId, createdById, allowInactive } = input;
  const lines = input.lines;

  assertBalanced(lines);

  for (const line of lines) {
    const account = await tx.account.findUnique({ where: { id: line.accountId } });
    if (!account) {
      throw new Error(`Account ${line.accountId} is missing or inactive`);
    }
    if (!account.isActive && !allowInactive) {
      throw new Error(`Account ${line.accountId} is missing or inactive`);
    }
    if (account.isGroup) {
      throw new Error(`Cannot post to group account ${account.code} ${account.nameEn}`);
    }
  }

  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { starts: { lte: date }, ends: { gte: date } },
  });
  if (!fiscalYear) {
    throw new Error(`No fiscal year covers ${date.toISOString().slice(0, 10)}`);
  }
  if (fiscalYear.status !== "OPEN") {
    throw new Error(`Fiscal year ${fiscalYear.name} is closed`);
  }

  const prefix = SOURCE_PREFIX[sourceType] ?? "JV";
  const seq = await nextNumber(tx, `${fiscalYear.name}:${prefix}`);
  const entryNo = `${prefix}-${fiscalYear.name}-${String(seq).padStart(4, "0")}`;

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date,
      narration,
      narrationAr,
      status: "POSTED",
      sourceType,
      sourceId,
      fiscalYearId: fiscalYear.id,
      createdById,
      postedAt: new Date(),
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit ?? 0n,
          credit: line.credit ?? 0n,
          partyId: line.partyId,
          description: line.description,
        })),
      },
    },
  });

  return entry;
}

export async function voidJournalEntry(entryId: string, tx?: Tx) {
  const client = tx ?? prisma;
  const entry = await client.journalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("Entry not found");
  if (entry.status === "DRAFT") {
    return client.journalEntry.update({
      where: { id: entryId },
      data: { status: "VOID" },
    });
  }
  throw new Error(
    `Journal entry ${entryId} is ${entry.status.toLowerCase()}; only DRAFT entries can be voided without a reversal`,
  );
}

export interface ReverseJournalInput {
  entryId: string;
  /** mandatory, caller-checked non-blank; appended to the reversal narration INSIDE the tx */
  reason: string;
  /** reversal date: default is today at the ACTION layer; must be >= original date, OPEN FY */
  date: Date;
  createdById: string;
  tx: Tx;
}

/**
 * P1.1 reversal-by-default. The original entry STAYS POSTED; a mirrored POSTED
 * reversal (every line copied with debit/credit swapped AND partyId + description
 * preserved) is linked via the unique reversesEntryId. Only POSTED targets.
 */
export async function reverseJournalEntry(input: ReverseJournalInput) {
  const { entryId, date, createdById } = input;
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("A non-blank reason is required");
  if (reason.length > 2000) throw new Error("Reason must be at most 2000 characters");
  if (Number.isNaN(date.getTime())) throw new Error("Reversal date is invalid");

  // Serialize concurrent reversals of the same target: lock BEFORE any reads.
  await input.tx.$queryRaw(Prisma.sql`SELECT id FROM "JournalEntry" WHERE id = ${entryId} FOR UPDATE`);

  const target = await input.tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true, reversedBy: { select: { id: true, entryNo: true } } },
  });
  if (!target) throw new Error("Journal entry not found");
  if (target.status !== "POSTED") {
    throw new Error(`Entry ${target.entryNo} is ${target.status} — only POSTED entries are reversed`);
  }
  if (target.reversedBy) throw new Error(`Entry ${target.entryNo} is already reversed by ${target.reversedBy.entryNo}`);
  if (target.reversesEntryId) throw new Error(`Entry ${target.entryNo} is itself a reversal and cannot be reversed`);
  if (target.sourceType === "YEAR_END_CLOSE") {
    throw new Error(`Entry ${target.entryNo} is a year-end close and cannot be reversed (D12)`);
  }

  // Date semantics: the app stores dates as UTC midnight, so compare CALENDAR
  // dates only — a time component (e.g. "today" computed in Asia/Dubai) must not
  // make a same-day reversal fail.
  if (toUtcDateString(date) < toUtcDateString(target.date)) {
    throw new Error(`Reversal date ${toUtcDateString(date)} is before the original entry date ${toUtcDateString(target.date)}`);
  }
  const fiscalYear = await input.tx.fiscalYear.findFirst({
    where: { starts: { lte: date }, ends: { gte: date } },
  });
  if (!fiscalYear) throw new Error(`No fiscal year covers ${toUtcDateString(date)}`);
  if (fiscalYear.status !== "OPEN") throw new Error(`Fiscal year ${fiscalYear.name} is closed`);

  const reversal = await postJournalEntry({
    tx: input.tx,
    date,
    narration: `REVERSAL of ${target.entryNo}: ${reason}`,
    narrationAr: target.narrationAr ? `عكس ${target.entryNo}: ${reason}` : null,
    sourceType: "REVERSAL",
    sourceId: target.sourceId ?? undefined,
    createdById,
    allowInactive: true,
    lines: target.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      partyId: l.partyId ?? undefined,
      description: l.description ?? undefined,
    })),
  });

  try {
    await input.tx.journalEntry.update({ where: { id: reversal.id }, data: { reversesEntryId: entryId } });
  } catch (e) {
    // unique violation on reversesEntryId => another reversal raced and won
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      throw new Error(`Entry ${target.entryNo} is already reversed`);
    }
    throw e;
  }
  return reversal;
}

export interface VoidManualJournalInput {
  entryId: string;
  /** mandatory; appended to the reversal narration inside the tx */
  reason: string;
  /** caller-resolved reversal date (default today in Asia/Dubai at the ACTION layer) */
  date: Date;
  createdById: string;
  tx: Tx;
}

/**
 * Void a manual journal entry by reversal (P1.1b, F11). The original entry
 * STAYS POSTED; a mirrored POSTED reversal is linked via reversesEntryId.
 * Only sourceType === "MANUAL" entries can be voided from the journals screen;
 * every other source type must be voided through its own source document.
 * Lock order: journal entry row first (same row reverseJournalEntry locks next,
 * inside the same transaction — no self-deadlock).
 */
export async function voidManualJournal(input: VoidManualJournalInput) {
  const { entryId, date, createdById } = input;
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new Error("A non-blank reason is required");
  if (reason.length > 2000) throw new Error("Reason must be at most 2000 characters");
  if (Number.isNaN(date.getTime())) throw new Error("Reversal date is invalid");

  const target = await input.tx.journalEntry.findUnique({ where: { id: entryId } });
  if (!target) throw new Error("Journal entry not found");
  if (target.sourceType !== "MANUAL") {
    throw new Error(`Entry ${target.entryNo} is a ${target.sourceType} entry — void the source document instead`);
  }
  if (target.status === "VOID") throw new Error(`Entry ${target.entryNo} is already void`);
  if (target.status === "DRAFT") {
    // DRAFT has no journal entry: voiding without a reversal is correct here.
    await voidJournalEntry(entryId, input.tx);
    return null;
  }
  if (target.status !== "POSTED") {
    throw new Error(`Entry ${target.entryNo} is ${target.status} — only POSTED entries can be voided`);
  }
  return reverseJournalEntry({ entryId: target.id, reason, date, createdById, tx: input.tx });
}

export interface AccountBalance {
  accountId: string;
  debit: bigint;
  credit: bigint;
  /** signed balance in terms of the account's normal balance side */
  balance: bigint;
  normalBalance: string;
}

export function signFor(normalBalance: string, debit: bigint, credit: bigint) {
  return normalBalance === "DEBIT" ? debit - credit : credit - debit;
}

export async function accountBalances(
  tx: Tx,
  opts: {
    upto?: Date;
    from?: Date;
    accountIds?: string[];
    partyId?: string;
  } = {},
) {
  const entryWhere: Prisma.JournalEntryWhereInput = { status: "POSTED" };
  if (opts.from && opts.upto) {
    entryWhere.date = { gte: opts.from, lte: opts.upto };
  } else if (opts.upto) {
    entryWhere.date = { lte: opts.upto };
  } else if (opts.from) {
    entryWhere.date = { gte: opts.from };
  }
  const where: Prisma.JournalLineWhereInput = { entry: entryWhere };
  if (opts.accountIds?.length) where.accountId = { in: opts.accountIds };
  if (opts.partyId) where.partyId = opts.partyId;

  const rows = await tx.journalLine.groupBy({
    by: ["accountId"],
    _sum: { debit: true, credit: true },
    where,
  });

  const accounts = await tx.account.findMany({
    where: { id: { in: rows.map((r) => r.accountId) } },
    select: { id: true, normalBalance: true },
  });
  const normalMap = new Map(accounts.map((a) => [a.id, a.normalBalance]));

  const out: AccountBalance[] = [];
  for (const row of rows) {
    const debit = row._sum.debit ?? 0n;
    const credit = row._sum.credit ?? 0n;
    const normal = normalMap.get(row.accountId) ?? "DEBIT";
    out.push({
      accountId: row.accountId,
      debit,
      credit,
      balance: signFor(normal, debit, credit),
      normalBalance: normal,
    });
  }
  return out;
}

/** Closing balance of a single leaf account up to `upto` (inclusive). */
export async function accountBalance(
  tx: Tx,
  accountId: string,
  upto?: Date,
): Promise<AccountBalance | null> {
  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, normalBalance: true },
  });
  if (!account) return null;
  const rows = await tx.journalLine.aggregate({
    where: {
      accountId,
      entry: {
        status: "POSTED",
        ...(upto ? { date: { lte: upto } } : {}),
      },
    },
    _sum: { debit: true, credit: true },
  });
  const debit = rows._sum.debit ?? 0n;
  const credit = rows._sum.credit ?? 0n;
  return {
    accountId,
    debit,
    credit,
    balance: signFor(account.normalBalance, debit, credit),
    normalBalance: account.normalBalance,
  };
}
