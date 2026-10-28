import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createInvoice, voidInvoiceWithReversal } from "../src/lib/invoices";
import { accountBalance } from "../src/lib/accounting";
import { todayDubai } from "../src/lib/dates";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@maxsolbiz.com" } });
  const customer = await prisma.party.findUniqueOrThrow({ where: { code: "CUST-001" } });
  const vendor = await prisma.party.findUniqueOrThrow({ where: { code: "VEND-001" } });
  const copper = await prisma.item.findFirstOrThrow({ where: { nameEn: "Copper Scrap" } });
  const iron = await prisma.item.findFirstOrThrow({ where: { nameEn: "Old Iron / Steel" } });

  // Sales invoice example: Copper Scrap: 35.5 kg @ 26.50 AED => 940.75 + 5% VAT 47.04 = 987.79
  const sales = await prisma.$transaction(async (tx) =>
    createInvoice({
      tx,
      direction: "SALES",
      date: new Date(),
      partyId: customer.id,
      createdById: admin.id,
      lines: [
        {
          itemId: copper.id,
          description: `${copper.nameEn} (mixed grade)`,
          qty: "35.5",
          unit: copper.unit,
          rateFils: 2650n,
          vatRate: 0.05,
        },
      ],
    }),
  );
  console.log("sales:", sales.invoiceNo, "subtotal", sales.subtotalFils.toString(), "vat", sales.vatFils.toString(), "total", sales.totalFils.toString());

  // Purchase invoice: Old Iron 1.2 TON @ 1200.00 AED/TON => 1440.00 + VAT 72.00 = 1512.00
  const purchase = await prisma.$transaction(async (tx) =>
    createInvoice({
      tx,
      direction: "PURCHASE",
      date: new Date(),
      partyId: vendor.id,
      createdById: admin.id,
      lines: [
        {
          itemId: iron.id,
          description: iron.nameEn,
          qty: "1.2",
          unit: iron.unit,
          rateFils: 120000n,
          vatRate: 0.05,
        },
      ],
    }),
  );
  console.log("purchase:", purchase.invoiceNo, purchase.subtotalFils.toString(), purchase.vatFils.toString(), purchase.totalFils.toString());

  const ar = await prisma.account.findUniqueOrThrow({ where: { code: "1130" } });
  const ap = await prisma.account.findUniqueOrThrow({ where: { code: "2100" } });
  const vatAcc = await prisma.account.findUniqueOrThrow({ where: { code: "2150" } });
  const salesBal = await accountBalance(prisma, ar.id);
  const apBal = await accountBalance(prisma, ap.id);
  const vatBal = await accountBalance(prisma, vatAcc.id);
  console.log("AR balance (credit-normal):", salesBal?.debit.toString(), "/", salesBal?.credit.toString());
  console.log("AP balance:", apBal?.debit.toString(), "/", apBal?.credit.toString());
  console.log("VAT payable net:", vatBal?.balance.toString());

  // void the sales invoice and confirm balances roll back
  const before = await accountBalance(prisma, ar.id);
  await prisma.$transaction(async (tx) =>
    voidInvoiceWithReversal({
      tx,
      invoiceId: sales.id,
      reason: "test void",
      date: todayDubai(),
      createdById: admin.id,
    }),
  );
  const after = await accountBalance(prisma, ar.id);
  console.log("AR before void:", before?.balance.toString(), "after void:", after?.balance.toString());
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
