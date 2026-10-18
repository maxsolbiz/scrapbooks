import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/tx";
import type { Prisma } from "@/generated/prisma/client";
import type { EntrySource } from "@/generated/prisma/enums";

export const FILS_PER_AED = 100;

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
}

const SOURCE_PREFIX: Record<string, string> = {
  MANUAL: "JV",
  SALES_INVOICE: "INV",
  PURCHASE_INVOICE: "PINV",
  PAYMENT: "PAY",
  RECEIPT: "RCP",
  OPENING_BALANCE: "OB",
  YEAR_END_CLOSE: "YEC",
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
  const { tx, date, narration, narrationAr, sourceType, sourceId, createdById } = input;
  const lines = input.lines;

  assertBalanced(lines);

  for (const line of lines) {
    const account = await tx.account.findUnique({ where: { id: line.accountId } });
    if (!account || !account.isActive) {
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
  if (entry.status === "VOID") return entry;
  return client.journalEntry.update({
    where: { id: entryId },
    data: { status: "VOID" },
  });
}

export interface AccountBalance {
  accountId: string;
  debit: bigint;
  credit: bigint;
  /** signed balance in terms of the account's normal balance side */
  balance: bigint;
  normalBalance: string;
}

function signFor(normalBalance: string, debit: bigint, credit: bigint) {
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
