"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n";

export async function setLocale(locale: "en" | "ar") {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
