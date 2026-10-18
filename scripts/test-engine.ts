import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { postJournalEntry, accountBalance } from "../src/lib/accounting";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@maxsolbiz.com" },
  });
  const cash = await prisma.account.findUniqueOrThrow({ where: { code: "1110" } });
  const capital = await prisma.account.findUniqueOrThrow({ where: { code: "3100" } });

  const entry = await prisma.$transaction(async (tx) =>
    postJournalEntry({
      tx,
      date: new Date(),
      narration: "Opening cash deposit",
      sourceType: "OPENING_BALANCE",
      createdById: admin.id,
      lines: [
        { accountId: cash.id, debit: 500000n },
        { accountId: capital.id, credit: 500000n },
      ],
    }),
  );
  console.log("posted:", entry.entryNo, entry.status);

  const bal = await accountBalance(prisma, cash.id);
  console.log("cash balance:", bal?.balance.toString());

  try {
    await prisma.$transaction(async (tx) =>
      postJournalEntry({
        tx,
        date: new Date(),
        sourceType: "OPENING_BALANCE",
        createdById: admin.id,
        lines: [
          { accountId: cash.id, debit: 100n },
          { accountId: capital.id, credit: 99n },
        ],
      }),
    );
    console.log("ERROR: unbalanced entry was accepted");
  } catch (e) {
    console.log("unbalanced rejected:", e instanceof Error ? e.message : e);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
