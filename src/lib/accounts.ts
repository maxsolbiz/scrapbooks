import { prisma } from "@/lib/db";

export interface AccountOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

/** Postable (leaf, active) accounts for selects in journal/payment forms. */
export async function listLeafAccounts(): Promise<AccountOption[]> {
  return prisma.account.findMany({
    where: { isGroup: false, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, nameEn: true, nameAr: true },
  });
}

export async function saveAccountRecord(opts: {
  id?: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  parentId?: string | null;
  isActive?: boolean;
}) {
  const data = {
    code: opts.code,
    nameEn: opts.nameEn,
    nameAr: opts.nameAr,
    type: opts.type,
    parentId: opts.parentId || null,
  };
  if (opts.id) {
    return prisma.account.update({
      where: { id: opts.id },
      data: opts.isActive === undefined ? data : { ...data, isActive: opts.isActive },
    });
  }
  const normalBalance = opts.type === "ASSET" || opts.type === "EXPENSE" ? "DEBIT" : "CREDIT";
  return prisma.account.create({
    data: {
      ...data,
      normalBalance,
    },
  });
}

export interface FlatAccount {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: string;
  isGroup: boolean;
  isActive: boolean;
  parentId: string | null;
  depth: number;
}

/** Full chart of accounts flattened to display order (depth-first). */
export async function getCoaTree(): Promise<FlatAccount[]> {
  const all = await prisma.account.findMany({
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameAr: true,
      type: true,
      isGroup: true,
      isActive: true,
      parentId: true,
    },
  });
  const byParent = new Map<string | null, typeof all>();
  for (const a of all) {
    const arr = byParent.get(a.parentId) ?? [];
    arr.push(a);
    byParent.set(a.parentId, arr);
  }
  const out: FlatAccount[] = [];
  function walk(parent: string | null, depth: number) {
    const children = byParent.get(parent) ?? [];
    for (const child of children) {
      out.push({ ...child, depth });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}
