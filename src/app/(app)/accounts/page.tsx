import { getCoaTree } from "@/lib/accounts";
import { requireUser } from "@/lib/guard";
import { getServerLocale, getDictionary } from "@/lib/i18n";
import { CoaClient } from "./CoaClient";

export default async function AccountsPage() {
  await requireUser();
  const [tree, locale] = await Promise.all([getCoaTree(), getServerLocale()]);
  const dict = getDictionary(locale);

  return <CoaClient tree={tree} dict={dict} />;
}
