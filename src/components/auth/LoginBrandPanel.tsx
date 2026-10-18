"use client";

import { BookText, Boxes, ClipboardCheck, TrendingUp } from "lucide-react";
import { useT } from "@/components/i18n/LocaleProvider";

const VALUE_ICONS = [ClipboardCheck, Boxes, TrendingUp] as const;
const VALUE_DELAYS = ["motion-safe:[animation-delay:150ms]", "motion-safe:[animation-delay:250ms]", "motion-safe:[animation-delay:350ms]"] as const;

export function LoginBrandPanel() {
  const t = useT();
  const values = [t.auth.v1, t.auth.v2, t.auth.v3];

  return (
    <aside
      className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden p-10 text-[oklch(0.985_0.005_170)] lg:flex xl:p-16 motion-safe:animate-in motion-safe:fade-in"
      style={{ background: "linear-gradient(160deg, oklch(0.16 0.03 170), oklch(0.21 0.055 166) 55%, oklch(0.26 0.075 164))" }}
    >
      {/* Decorative art: circular material flow + ledger lines (CSS/SVG only) */}
      <svg
        aria-hidden="true"
        className="absolute -end-28 -top-28 size-[440px] opacity-[0.13]"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <circle cx="100" cy="100" r="72" strokeDasharray="300 60" />
        <circle cx="100" cy="100" r="48" strokeDasharray="90 40" />
        <circle cx="100" cy="100" r="24" />
        <path d="M28 100h-16M172 100h16M100 12V0M100 188v12" />
      </svg>
      <svg
        aria-hidden="true"
        className="absolute -bottom-24 start-0 size-[380px] opacity-[0.09]"
        viewBox="0 0 240 160"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M0 120h60l24-40h48l20-32h80" />
        <path d="M0 140h40l30-28h56l26-24h70" />
        <circle cx="60" cy="120" r="3" />
        <circle cx="84" cy="80" r="3" />
        <circle cx="132" cy="80" r="3" />
        <circle cx="152" cy="48" r="3" />
      </svg>

      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
          <BookText className="size-5.5" />
        </span>
        <span>
          <span className="block text-lg font-semibold leading-tight tracking-tight">{t.appName}</span>
          <span className="block text-[11px] leading-tight text-white/60">{t.appSub}</span>
        </span>
      </div>

      <div className="relative z-10 max-w-md">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:[animation-delay:60ms]">
          {t.auth.welcome}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-white/70 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:[animation-delay:120ms]">
          {t.auth.workspace}
        </p>
        <ul className="mt-10 space-y-4">
          {values.map((label, i) => {
            const Icon = VALUE_ICONS[i];
            return (
              <li
                key={i}
                className={`flex items-center gap-3 text-sm text-white/80 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 ${VALUE_DELAYS[i]}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8 ring-1 ring-white/15">
                  <Icon className="size-4 text-emerald-300" />
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="relative z-10 text-xs text-white/50">
        <p>
          © {new Date().getFullYear()} {t.appName} · {t.auth.poweredBy}{" "}
          <a
            href="https://maxsolbiz.com"
            target="_blank"
            rel="noreferrer noopener"
            className="text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            MaxSolBiz IT Solutions
          </a>
        </p>
      </footer>
    </aside>
  );
}
