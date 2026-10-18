# ScrapBooks Design System v2 — Plan & Status

> Living document for the UI/UX modernization of the ScrapBooks accounting app.
> Update the status checkboxes and "Current State" section as work progresses.

---

## Project Context

- **App**: ScrapBooks — double-entry accounting for a scrap trading business (UAE).
- **Stack**: Next.js 16.4.2 (App Router, `cacheComponents: false`), React 19.2, TypeScript, Tailwind v4
  (CSS-first `@theme`), shadcn/ui (`-b radix --rtl -p nova`), Prisma 7.10 + PostgreSQL 16
  (driver adapter `@prisma/adapter-pg`), NextAuth v5-beta.
- **Money model**: `bigint` fils (1 AED = 100 fils). Never store floats. Render via `src/lib/money.ts`.
- **Bilingual**: EN/AR, cookie `scrapbooks-locale`, RTL via `dir` on `<html>`; Arabic font Noto Kufi Arabic.
- **Prod**: https://accounts.maxsolbiz.com (Hetzner VPS `178.105.109.19`, PM2 `scrapbooks` on :3105,
  Apache reverse-proxy + Let's Encrypt, Cloudflare proxied A-record, nightly pg_dump 02:30 cron).

## Designer Decisions (user-approved 2026-10-18)

| Decision | Chosen |
|---|---|
| Brand color | **Emerald / deep green** (finance-trust classic) with neutral slate grays |
| Dark mode | **Yes** — next-themes, light + dark toggle, sidebar designed dark-first |
| Typography | **Geist Sans** (UI) + **Geist Mono** (money/codes) + **Noto Kufi Arabic** (RTL) |
| Dashboard charts | **Native SVG/CSS** server-rendered — NO chart library (no recharts) |
| Print invoice | Stays B/W by design (FTA tax invoice neutrality) — micro-polish only |

---

## Phase 1 — Foundations (`globals.css`, `layout.tsx`) — IN PROGRESS

- [ ] **P1.1 Fix font wiring bug**: layout exposes `--font-geist-sans`, but theme read `var(--font-sans)`
      which resolved to itself → Geist never applied. Rewire `--font-sans: var(--font-geist-sans)`;
      add `--font-heading` same source; keep mono `--font-geist-mono`; map `--font-arabic`.
- [ ] **P1.2 Emerald token layer** (light + dark in `globals.css`):
      - `--primary` ≈ oklch(0.45 0.09 165) deep emerald, `--primary-foreground` white
      - Semantic status: POSTED → emerald-600; DRAFT → amber/neutral; VOID → red-600
      - Chart ramp `--chart-1..5`: emerald → teal → slate-blue → amber → red (colorblind-safe)
      - Sidebar: dark charcoal-green surface in BOTH modes (`oklch(0.21 0.03 170)`-family):
        `--sidebar` dark, `--sidebar-foreground` light, active item emerald tint
      - Radius tightened to `--radius: 0.5rem` (enterprise feel)
- [ ] **P1.3 Global numeric rule**: `font-variant-numeric: tabular-nums` on `td`/`th.numeric`,
      `.money` utility = Geist Mono + tabular + right-aligned.
- [ ] **P1.4 next-themes integration** (dark mode): ThemeProvider (attribute="class", defaultTheme="light",
      enableSystem=false), toggle in top bar; `.dark` variant already declared via `@custom-variant`.
- [ ] **P1.5 Arabic font application**: for `dir=rtl` set body font-family to Noto Kufi Arabic
      with Geist fallback for Latin digits/codes (test both locales after change).

**Status: COMPLETED** (2026-10-18)

## Phase 2 — Shell & Chrome (`AppShell.tsx`, new HeaderBar)

- [x] **P2.1 Sidebar groups** — section labels:
      OPERATE (Sales Invoices, Purchase Invoices, Payments) ·
      BOOKS (Chart of Accounts, Journal Vouchers) ·
      PEOPLE & CATALOG (Parties, Items) ·
      INSIGHTS (Reports) ·
      ADMIN (Fiscal Years, Settings)
- [x] **P2.2 Active state**: emerald-tinted pill + 3px left rail indicator; refined hover; section dividers.
- [x] **P2.3 Sidebar visual**: dark surface both modes (uses sidebar tokens), collapse toggle (chevron),
      app logo/wordmark header with `appSub` tagline, users section remains bottom.
- [x] **P2.4 Topbar**: breadcrumb (module/page via route segments + dict), locale switcher,
      dark-mode toggle (sun/moon), existing user dropdown (kept).
- [x] **P2.5 Shared `PageHeader`** (title / description / actions slot) — applied to ALL module pages
      (dashboard, accounts, journals(+new/detail), sales+purchase lists/new/detail, payments(+new/detail),
      parties, items, reports (+6 report pages), fiscal-years, settings).

**Status: COMPLETED**

## Phase 3 — Component Polish

- [x] **P3.1 `StatusBadge`** (`src/components/ui/status-badge.tsx`): dot + localized label;
      maps INVOICE/JOURNAL/PAYMENT/FISCAL statuses → DRAFT amber, POSTED emerald, VOID/CLOSED red outline.
      Replaced raw `<Badge>{status}</Badge>` in all list/detail pages.
- [x] **P3.2 `Money` component** (`src/components/ui/money.tsx`): renders fils (bigint|string) as
      Geist Mono tabular right-aligned; optional `aed` suffix; used across tables & detail pages.
- [x] **P3.3 Table polish**: sticky `<TableHeader>` (top-0 bg-card), `hover:bg-muted/50` rows, tighter
      compact paddings, consistent right-aligned numerics via `Money`.
- [x] **P3.4 `ConfirmDialog`** (`src/components/ui/confirm-dialog.tsx`): shadcn AlertDialog wrapper;
      replaced ALL `window.confirm` (VoidInvoiceButton, VoidJournalButton, VoidPaymentButton).
- [x] **P3.5 KPI cards** (dashboard): small caps 11px label + icon watermark, 24px tabular value,
      trend chip (delta vs prior period) on revenue/cash cards.
- [x] **P3.6 Form consistency**: unified field spacing (space-y-1.5 pattern), focus ring token
      (`--ring` emerald), helper/error text style consistent.
- [x] **P3.7 `loading.tsx` skeletons** for list routes: dashboard, journals(+detail), sales+purchase
      invoices(+detail), payments(+detail), parties, items, accounts, reports/*, fiscal-years, settings.

**Status: COMPLETED**

## Phase 4 — Dashboard as Showcase

- [x] **P4.1 KPI row**: Cash · Bank · AR · AP · VAT Payable · Net Profit (FY) — six cards,
      server-rendered balances via `accountBalance()`, links to related pages.
- [x] **P4.2 Native SVG mini-charts** (server-rendered, zero client JS):
      - Monthly revenue vs expense — grouped bars from posted ledger data (INCOME/EXPENSE per month)
      - Cash balance trend — sparkline (end-of-month running balance, 12 months)
      - SVG built in a small shared component `src/components/reports/ChartSVG.tsx` family.
- [x] **P4.3 Recent activity feed**: unified latest journals/invoices/payments rows with links.

**Status: COMPLETED**

## Phase 5 — Finishing & Deployment

- [ ] **P5.1 RTL/Arabic pass** font swap + nav/typography symmetry check.
- [ ] **P5.2 Contrast audit** on badge/status/primary combos (target WCAG AA).
- [ ] **P5.3 Verify**: `npx tsc --noEmit --incremental false` + `npm run build` + dev-server smoke test.
- [ ] **P5.4 Commit & push** to `git@github.com:maxsolbiz/scrapbooks.git` AND bridge remote `vps`.
- [ ] **P5.5 Deploy**: VPS `git -C /root/scrapbooks pull` from /root/scrapbooks.git bare bridge →
      `npm ci` (if lockfile changed) → `next build` → `pm2 restart scrapbooks` → smoke-test via curl 200.



---

## Current State

- **Deployed baseline**: shadcn defaults (neutral palette, font bug, light only), v2 design system NOT yet applied. This file is updated in place as each phase completes.
- Deployed production app (functional v1): https://accounts.maxsolbiz.com (PM2 id 25, port 3105).
- **Deploy update procedure** (repeat P5.5 at the end of every phase):

  ```bash
  # local (Windows, repo D:\Arslan\scrapbooks)
  git add -A ; git commit -m "..." ; git push origin master ; git push vps master
  # VPS
  ssh scrapbooks-vps "cd /root/scrapbooks && git pull && npm ci --no-audit --no-fund && npx next build && pm2 restart scrapbooks"
  ```

## Key Files (map of touchpoints)

| Concern | File |
|---|---|
| Tokens/theme/dark | `src/app/globals.css` |
| Fonts (Geist + Arabic) | `src/app/layout.tsx` |
| Shell (sidebar/topbar) | `src/components/layout/AppShell.tsx` |
| ThemeProvider | `src/components/theme/ThemeProvider.tsx` (next-themes) |
| StatusBadge / ConfirmDialog / Money | `src/components/ui/*` |
| PageHeader | `src/components/layout/PageHeader.tsx` |
| Loading skeletons | `src/app/(app)/**/loading.tsx` |
| Dashboard redesign | `src/app/(app)/dashboard/page.tsx` |
| Chart SVG components | `src/components/reports/ChartSVG.tsx` |
| Print invoice (B/W) | `src/components/invoices/InvoicePrintView.tsx` |

## Known Caveats / Debug Notes

- Print view must never pick up dark theme colors → `InvoicePrintView` wraps content in
  `bg-white text-black` and hides shell chrome with `no-print` class. If something looks dark when
  printing, check that `next-themes` class is present on `<html>` and the print wrapper still forces
  light colors for its subtree.
- Dark mode uses `class` strategy; ensure `<html className>` still carries font variables AND the
  theme class (ThemeProvider manipulates the element — `suppressHydrationWarning` already set).
- Arabic font: Geist Mono digits inside RTL pages rely on `dir=ltr` wrappers in `Money`;
  don't remove them.
- Sidebar is dark by design in BOTH themes; do not swap `--sidebar` tokens to light values when
  "fixing" light mode.
- Dashboard charts read FiscalYear OPEN; if no OPEN FY exists, charts show empty-state (by design).
- next-themes flash: ThemeProvider `defaultTheme="light" enableSystem=false` keeps SSR/HMR
  deterministic; if a user complains about flash, revisit with a blocking script.
- PM2 process is `npx next start -p 3105`; `--max-memory-restart 900M` was moved to the correct
  position (before `--`).
- Local dev DB: Docker `scrapbooks-db`, port 54322. `npx tsc --noEmit --incremental false` to avoid
  stale build-info false positives.
- The `vps` git remote is `ssh://scrapbooks-vps/root/scrapbooks.git`; push there then pull on server
  (GitHub deploy key was not possible — gh token had only READ on maxsolbiz/scrapbooks).

