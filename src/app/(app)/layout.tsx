import { redirect } from "next/navigation";
import { getAccess } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if (!access) {
    redirect("/login");
  }
  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return (
    <AppShell
      user={{
        name: access.user.name ?? access.user.email ?? "",
        email: access.user.email ?? "",
        role: access.user.role ?? undefined,
      }}
      perms={access.perms}
      dict={dict}
    >
      {children}
    </AppShell>
  );
}
