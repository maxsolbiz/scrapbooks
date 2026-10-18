import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { trialBalance, balanceSheet, profitAndLossOfYearToDate } from "../src/lib/reports";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const asOf = new Date();
  const tb = await trialBalance(asOf);
  const d = tb.reduce((a, r) => a + (r.debitTotal > r.creditTotal ? r.debitTotal - r.creditTotal : 0n), 0n);
  const c = tb.reduce((a, r) => a + (r.creditTotal > r.debitTotal ? r.creditTotal - r.debitTotal : 0n), 0n);
  console.log("TB balancing debit:", d.toString(), "credit:", c.toString(), d === c ? "BALANCED ✓" : "MISMATCH ✗");

  const bs = await balanceSheet(asOf);
  console.log(
    "BS assets:", bs.assetsTotal.toString(),
    "liab:", bs.liabilitiesTotal.toString(),
    "equity:", bs.equityTotal.toString(),
    "earned:", bs.earnedEquity.toString(),
    "check:", bs.grandTotal.toString(),
    bs.grandTotal === 0n ? "BALANCED ✓" : "CHECK ✗",
  );

  const pl = await profitAndLossOfYearToDate(asOf);
  console.log("P&L revenue:", pl.revenueTotal.toString(), "expense:", pl.expenseTotal.toString(), "net:", pl.net.toString());
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
