import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPayment } from "../src/lib/payments";
import { createInvoice } from "../src/lib/invoices";
import { accountBalance } from "../src/lib/accounting";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@maxsolbiz.com" } });
  const customer = await prisma.party.findUniqueOrThrow({ where: { code: "CUST-001" } });
  const vendor = await prisma.party.findUniqueOrThrow({ where: { code: "VEND-001" } });
  const copper = await prisma.item.findFirstOrThrow({ where: { nameEn: "Copper Scrap" } });
  const cash = await prisma.account.findUniqueOrThrow({ where: { code: "1110" } });
  const bank = await prisma.account.findUniqueOrThrow({ where: { code: "1120" } });
  const ar = await prisma.account.findUniqueOrThrow({ where: { code: "1130" } });
  const ap = await prisma.account.findUniqueOrThrow({ where: { code: "2100" } });

  // open sales invoice: 940.75 + 47.03 VAT = 987.79 total
  const sales = await prisma.$transaction(async (tx) =>
    createInvoice({
      tx,
      direction: "SALES",
      date: new Date(),
      partyId: customer.id,
      createdById: admin.id,
      lines: [
        { itemId: copper.id, description: copper.nameEn, qty: "10", unit: copper.unit, rateFils: 2650n, vatRate: 0.05 },
      ],
    }),
  );
  const subtotal = Number(sales.subtotalFils) / 100;
  const total = Number(sales.totalFils) / 100;
  console.log("sales invoice:", sales.invoiceNo, "total", total.toFixed(2));

  // partial receipt: 500 allocated to that invoice
  const rcp = await prisma.$transaction(async (tx) =>
    createPayment({
      tx,
      type: "RECEIPT",
      method: "CASH",
      date: new Date(),
      partyId: customer.id,
      amountFils: 10000n,
      createdById: admin.id,
      allocations: [{ invoiceId: sales.id, amountFils: 10000n }],
    }),
  );
  console.log("receipt:", rcp.paymentNo);
  const arBal = await accountBalance(prisma, ar.id);
  console.log("AR balance after partial receipt (fils):", arBal?.debit.toString());

  // allocation exceeding outstanding must fail
  try {
    await prisma.$transaction(async (tx) =>
      createPayment({
        tx,
        type: "RECEIPT",
        method: "BANK",
        date: new Date(),
        partyId: customer.id,
        amountFils: 10_000_000n,
        createdById: admin.id,
        allocations: [{ invoiceId: sales.id, amountFils: 10_000_000n }],
      }),
    );
    console.log("FAIL: over-allocation was allowed");
  } catch (e) {
    console.log("over-alloc rejected:", e instanceof Error ? e.message : e);
  }

  // vendor payment for open purchase invoice
  const purchase = await prisma.invoice.findUniqueOrThrow({ where: { invoiceNo: "PINV-FY2026-0001" } });
  const pay = await prisma.$transaction(async (tx) =>
    createPayment({
      tx,
      type: "PAYMENT",
      method: "BANK",
      date: new Date(),
      partyId: vendor.id,
      amountFils: purchase.totalFils,
      createdById: admin.id,
      allocations: [{ invoiceId: purchase.id, amountFils: purchase.totalFils }],
    }),
  );
  console.log("payment:", pay.paymentNo);
  const apBal = await accountBalance(prisma, ap.id);
  console.log("AP balance after full payment (fils):", apBal?.debit.toString());

  // contra cash -> bank
  const con = await prisma.$transaction(async (tx) =>
    createPayment({
      tx,
      type: "CONTRA",
      method: "CASH",
      date: new Date(),
      amountFils: 25000n,
      createdById: admin.id,
    }),
  );
  console.log("contra:", con.paymentNo);
  const cashBal = await accountBalance(prisma, cash.id);
  const bankBal = await accountBalance(prisma, bank.id);
  console.log("cash/fils:", cashBal?.balance.toString(), "bank/fils:", bankBal?.balance.toString());
  console.log("sales subtotal check:", subtotal.toFixed(2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
