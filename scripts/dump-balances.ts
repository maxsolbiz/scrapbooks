import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  for (const code of ["1110", "1120", "1130", "2100", "2150"]) {
    const lines = await prisma.journalLine.findMany({
      where: { account: { code } },
      include: { entry: { select: { status: true } } },
    });
    const posted = lines.filter((l) => l.entry.status === "POSTED");
    const net = posted.reduce((acc, l) => acc + (l.debit ?? 0n) - (l.credit ?? 0n), 0n);
    const voided = lines.length - posted.length;
    console.log(code, "posted-net:", net.toString(), "fils", `(${posted.length} lines, ${voided} voided)`);
    for (const l of lines.slice(0, 8)) {
      console.log("  ", (l.debit ?? 0n).toString(), "/", (l.credit ?? 0n).toString(), l.entry.status);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
