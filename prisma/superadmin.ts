import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.env.SA_EMAIL ?? "root@maxsolbiz.com";
  const password = process.env.SA_PASSWORD ?? "";

  if (!password || password.length < 14) {
    console.error("SA_PASSWORD must be at least 14 chars");
    process.exit(1);
  }

  await prisma.user.upsert({
    where: { email },
    update: { role: "SUPER_ADMIN", isActive: true },
    create: {
      name: "Super Admin",
      email,
      passwordHash: await hash(password, 12),
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Super admin ready: ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
