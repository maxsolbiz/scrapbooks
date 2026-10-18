import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { WifiOff } from "lucide-react";

export default async function OfflinePage() {
  await requireUser();
  const locale = await getServerLocale();
  const t = getDictionary(locale);
  return (
    <main className="flex min-h-(100dvh) flex-col items-center justify-center gap-3 p-8 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{t.offline.title}</h1>
      <p className="max-w-72 text-sm text-muted-foreground">{t.offline.body}</p>
    </main>
  );
}
