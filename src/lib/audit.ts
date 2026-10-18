import { prisma } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/guard";

export async function logAudit(user: SessionUser, action: string, entityType?: string, entityId?: string, detail?: string) {
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userEmail: user.email ?? "",
      action,
      entityType,
      entityId,
      detail,
    },
  });
}

/** Shorthand for server actions that need auth + audit together. */
export async function auditedUser(action: string, entityType?: string, entityId?: string, detail?: string) {
  const user = await requireUser();
  await logAudit(user, action, entityType, entityId, detail);
  return user;
}
