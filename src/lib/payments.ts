import type { Tx } from "@/lib/tx";
import type { EntrySource, PaymentMethod, PaymentType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { postJournalEntry, voidJournalEntry } from "@/lib/accounting";

const CASH_CODE = "1110";
const BANK_CODE = "1120";
const AR_CODE = "1130";
const AP_CODE = "2100";

export interface PaymentAllocationInput {
  invoiceId: string;
  amountFils: bigint;
}

export interface CreatePaymentInput {
  type: PaymentType;
  method: PaymentMethod;
  date: Date;
  partyId?: string | null;
  amountFils: bigint;
  reference?: string | null;
  referenceAr?: string | null;
  notes?: string | null;
  allocations?: PaymentAllocationInput[];
  createdById: string;
  tx: Tx;
}

/**
 * Row-lock the invoice rows a write touches, BEFORE any status/direction/outstanding
 * reads, so concurrent writers serialize. Ids are deduped and sorted, and the SQL
 * locks in `ORDER BY id` order (an IN-list does not guarantee Postgres lock order),
 * which prevents AB/BA deadlocks between payments allocating overlapping sets.
 * Parameterized via Prisma.join — never string-interpolated.
 */
export async function lockInvoices(tx: Tx, invoiceIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(invoiceIds)].sort();
  if (ids.length === 0) return ids;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Invoice" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
  return ids;
}

export async function outstandingForInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      allocations: {
        include: { payment: { select: { status: true } } },
      },
    },
  });
  if (!invoice) return null;
  if (invoice.status !== "POSTED") return null;
  const allocated = invoice.allocations
    .filter((a) => a.payment.status !== "VOID")
    .reduce((acc, a) => acc + a.amountFils, 0n);
  return invoice.totalFils - allocated;
}

export async function createPayment(input: CreatePaymentInput) {
  const { tx, type, method, date, partyId, amountFils, createdById, allocations = [] } = input;

  if (amountFils <= 0n) throw new Error("Amount must be positive");
  if (type !== "CONTRA" && !partyId) throw new Error("Party is required");

  let sourceType: EntrySource;
  let prefix: string;
  if (type === "RECEIPT") {
    sourceType = "RECEIPT";
    prefix = "RCP";
  } else {
    sourceType = "PAYMENT";
    prefix = type === "CONTRA" ? "CON" : "PAY";
  }

  const cash = await tx.account.findUnique({ where: { code: CASH_CODE } });
  const bank = await tx.account.findUnique({ where: { code: BANK_CODE } });
  const ar = await tx.account.findUnique({ where: { code: AR_CODE } });
  const ap = await tx.account.findUnique({ where: { code: AP_CODE } });
  if (!cash || !bank || !ar || !ap) {
    throw new Error("Required accounts (1110/1120/1130/2100) are missing");
  }
  const accountOf = method === "CASH" ? cash : bank;

  // Lock FIRST (before status/direction/outstanding reads — F2), then validate
  // allocations with duplicates AGGREGATED per invoice (F2b): two rows for the
  // same invoice must be summed, not each checked independently.
  await lockInvoices(tx, allocations.map((a) => a.invoiceId));
  const perInvoice = new Map<string, bigint>();
  let allocatedTotal = 0n;
  const expectedDirection = type === "RECEIPT" ? "SALES" : "PURCHASE";
  for (const alloc of allocations) {
    if (alloc.amountFils <= 0n) throw new Error("Allocation amount must be positive");
    perInvoice.set(alloc.invoiceId, (perInvoice.get(alloc.invoiceId) ?? 0n) + alloc.amountFils);
    const invoice = await tx.invoice.findUnique({
      where: { id: alloc.invoiceId },
      include: { party: { select: { id: true } } },
    });
    if (!invoice || invoice.status !== "POSTED") {
      throw new Error("Allocated invoice not found or not posted");
    }
    if (invoice.direction !== expectedDirection) {
      throw new Error(
        type === "RECEIPT"
          ? "Receipts allocate to sales invoices"
          : "Payments allocate to purchase invoices",
      );
    }
    if (invoice.party.id !== partyId) {
      throw new Error("Allocated invoice belongs to a different party");
    }
    allocatedTotal += alloc.amountFils;
  }
  // F2b: per-invoice totals against outstanding (sum of duplicate rows)
  for (const [invoiceId, sum] of perInvoice) {
    const outstanding = await outstandingForInvoice(tx, invoiceId);
    if (outstanding !== null && sum > outstanding) {
      throw new Error("Allocation exceeds the invoice outstanding");
    }
  }
  if (allocatedTotal > amountFils) {
    throw new Error("Allocations exceed the payment amount");
  }

  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { starts: { lte: date }, ends: { gte: date } },
  });
  if (!fiscalYear) throw new Error(`No fiscal year covers ${date.toISOString().slice(0, 10)}`);
  if (fiscalYear.status !== "OPEN") throw new Error("Fiscal year is closed");

  const serial = await tx.serial.upsert({
    where: { key: `${fiscalYear.name}:${prefix}` },
    update: { value: { increment: 1 } },
    create: { key: `${fiscalYear.name}:${prefix}`, value: 1 },
  });
  const paymentNo = `${prefix}-${fiscalYear.name}-${String(serial.value).padStart(4, "0")}`;

  let jeId: string | null = null;

  if (type === "RECEIPT") {
    const party = await tx.party.findUniqueOrThrow({ where: { id: partyId as string } });
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Receipt ${paymentNo} from ${party.nameEn}`,
      narrationAr: `مقبوضات ${paymentNo} من ${party.nameAr}`,
      sourceType,
      createdById,
      lines: [
        { accountId: accountOf.id, debit: amountFils },
        { accountId: ar.id, credit: amountFils, partyId: partyId ?? undefined },
      ],
    });
    jeId = je.id;
  } else if (type === "PAYMENT") {
    const party = await tx.party.findUniqueOrThrow({ where: { id: partyId as string } });
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Payment ${paymentNo} to ${party.nameEn}`,
      narrationAr: `سدد ${paymentNo} إلى ${party.nameAr}`,
      sourceType,
      createdById,
      lines: [
        { accountId: ap.id, debit: amountFils, partyId: partyId ?? undefined },
        { accountId: accountOf.id, credit: amountFils },
      ],
    });
    jeId = je.id;
  } else {
    // CONTRA: money moves between cash & bank; method = the SOURCE account
    const otherAccount = method === "CASH" ? bank : cash;
    const sourceName = method === "CASH" ? "Cash" : "Bank";
    const targetName = method === "CASH" ? "Bank" : "Cash";
    const je = await postJournalEntry({
      tx,
      date,
      narration: `Contra ${paymentNo}: ${sourceName} → ${targetName}`,
      narrationAr: `نحوي ${paymentNo}: ${sourceName} → ${targetName}`,
      sourceType,
      createdById,
      lines: [
        { accountId: otherAccount.id, debit: amountFils },
        { accountId: accountOf.id, credit: amountFils },
      ],
    });
    jeId = je.id;
  }

  const payment = await tx.payment.create({
    data: {
      paymentNo,
      type,
      method,
      date,
      partyId: type === "CONTRA" ? null : partyId || null,
      status: "POSTED",
      amountFils,
      reference: input.reference || null,
      referenceAr: input.referenceAr || null,
      notes: input.notes || null,
      journalEntryId: jeId,
      createdById,
      allocations: {
        create: allocations.map((a) => ({
          invoiceId: a.invoiceId,
          amountFils: a.amountFils,
        })),
      },
    },
  });

  return payment;
}

export async function voidPayment(tx: Tx, paymentId: string): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "VOID") return;
  await tx.payment.update({ where: { id: paymentId }, data: { status: "VOID" } });
  if (payment.journalEntryId) {
    await voidJournalEntry(payment.journalEntryId, tx);
  }
}
