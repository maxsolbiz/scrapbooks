import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Kufi_Arabic } from "next/font/google";
import { getServerLocale, getDictionary, isRtl } from "@/lib/i18n";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoKufiArabic = Noto_Kufi_Arabic({
  variable: "--font-noto-kufi",
  subsets: ["arabic"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScrapBooks — Accounting & Ledger",
  description: "Double-entry accounting for scrap trading businesses",
};

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const locale = await getServerLocale();
  const dict = getDictionary(locale);
  const rtl = isRtl(locale);

  return (
    <html
      lang={locale}
      dir={rtl ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoKufiArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider dict={dict} locale={locale}>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
