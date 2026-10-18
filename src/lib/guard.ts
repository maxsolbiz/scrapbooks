import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user) redirect("/login");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** ADMIN + ACCOUNTANT can post/edit; VIEWER is read-only. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "VIEWER") redirect("/dashboard");
  return user;
}

/** Only ADMIN passes; everyone else is redirected to /dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export function canEdit(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "ACCOUNTANT";
}
