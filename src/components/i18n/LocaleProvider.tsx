"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary, Locale } from "@/lib/i18n";

const DictionaryContext = createContext<Dictionary | null>(null);
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  dict,
  locale,
  children,
}: {
  dict: Dictionary;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <DictionaryContext.Provider value={dict}>
      <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
    </DictionaryContext.Provider>
  );
}

export function useT(): Dictionary {
  const dict = useContext(DictionaryContext);
  if (!dict) throw new Error("useT used without LocaleProvider");
  return dict;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
