import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type PrismaClientInstance = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

function createClient() {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://scrap:scrapdev@localhost:54322/scrapbooks?schema=public",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
