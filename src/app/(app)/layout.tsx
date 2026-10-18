import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const locale = await getServerLocale();
  const dict = getDictionary(locale);

  return (
    <AppShell
      user={{
        name: session.user.name ?? session.user.email ?? "",
        email: session.user.email ?? "",
        role: session.user.role,
      }}
      dict={dict}
    >
      {children}
    </AppShell>
  );
}
