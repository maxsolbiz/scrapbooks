import { listLeafAccounts } from "@/lib/accounts";
import { requireEditor } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { JournalForm } from "../JournalForm";

export default async function NewJournalPage() {
  await requireEditor();
  const [accounts, locale] = await Promise.all([listLeafAccounts(), getServerLocale()]);
  const dict = getDictionary(locale);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return <JournalForm accounts={accounts} dict={dict} today={today} />;
}
