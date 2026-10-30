# SCRAPBOOKS — ENTERPRISE INVOICING UPGRADE ROADMAP

## Status Legend
- PENDING: not started
- PLANNED: plan written, awaiting approval
- APPROVED: approved for build
- IN_PROGRESS: currently building
- DONE: commits exist, build passes, tests pass, evidence in LEDGER.md, acknowledged
- BLOCKED: waiting on dependency/decision
- DROPPED: explicitly removed

---

## Findings (F1-F13 Verification)

| ID | Claim | Verdict | Evidence |
|---|---|---|---|
| F1 | voidJournalEntry only flips status, no reversal, no FY check | CONFIRMED | accounting.ts:130-139 |
| F2 | outstandingForInvoice race condition, no row lock | CONFIRMED | payments.ts:29-44, 95 |
| F3 | voidPayment ignores allocations | CONFIRMED | payments.ts:194-201 |
| F4 | roundFils/multiplyFilsByDecimal truncate; VAT per-line | CONFIRMED | invoices.ts:48-53, money.ts:45-51, invoices.ts:84-89 |
| F5 | Purchases post to 5100 expense; no inventory account | CONFIRMED | invoices.ts:46,145; schema.prisma:219-232 |
| F6 | trialBalance loads all lines in JS; accountLedger ignores normalBalance | CONFIRMED | reports.ts:14-41, 58-93 |
| F7 | No credit/debit notes, no supplierRef unique, no DB constraints | CONFIRMED | schema.prisma; accounting.ts:48-71 |
| F8 | src/generated/prisma committed; no real test runner; default README | CONFIRMED | repo structure; package.json; README.md |
| F9 | No idempotency keys on financial endpoints (invoice/payment/journal create) | CONFIRMED | invoice-actions.ts:62-112; payments/actions.ts:29-63; journals/actions.ts:39-80 |
| F10 | resetDemoDataAction deletes ALL payments, invoices, journals AND the AuditLog; gated only by SUPER_ADMIN role, no environment guard | CONFIRMED | settings/actions.ts:190-194; demo-data.ts:277-286 |
| F11 | Manual journal void bypasses reversal: \`voidJournal\` flips entry status directly to VOID with no reversal entry, no FY check, and no mandatory reason — outside the P1.1 reversal-by-default rule | CONFIRMED — resolved in P1.1b (6e610ad): \`voidJournal\` now routes through \`reverseJournalEntry\` with a mandatory reason; only DRAFT MANUAL entries can be voided directly | src/app/(app)/journals/actions.ts:82-89 |
| F2b | Allocation validation checks each row against outstandingForInvoice independently and the action schema has no duplicate guard, so two rows for one invoice (700+700 vs outstanding 1000) both pass | CONFIRMED | payments.ts:76-104; payments/actions.ts:24-25 |
| F12 | Invoice line qty with more than 3 decimals: createInvoice computes lineValue from the first 3 decimals (multiplyFilsByDecimal truncates) while InvoiceLine.qty (NUMERIC(18,3)) is stored rounded, so stored qty x rate differs from stored lineValueFils (1.0005 -> stored 1.001, value computed from 1.000); the action schema is only z.string().min(1) | CONFIRMED - RESOLVED in 19f1ebd: multiplyFilsByDecimal rejects more than 3 decimals (D15, reviewer default, NOT user-confirmed) | src/lib/invoices.ts:79,121; src/lib/invoice-actions.ts:25; tests/db/invoice-qty-guard.test.ts |
| F13 | partyLedger labels any entry that is neither an invoice nor a payment (manual journal, opening balance) as kind PAYMENT and the page links /payments/<journal-entry-id> -> 404 | CONFIRMED - OPEN | src/lib/reports.ts; src/app/(app)/reports/party-ledger/page.tsx |

---

## Decisions

| ID | Decision | Answer | Date |
|---|---|---|---|
| D1 | VAT treatment of deduction types (pre-VAT vs post-VAT) | Proportional VAT adjustment: Input is VAT-exclusive base; system calculates proportional VAT using original line's rate; posts balanced JE adjusting Base + VAT + AR/AP per FTA rules. | 2026-10-30 |
| D2 | Inventory valuation method (weighted avg proposed) | | |
| D3 | Who may amend posted invoices (ACCOUNTANT/ADMIN, second approval?) | | |
| D4 | VAT calculation: per-line vs per-invoice | per-line half-up (reviewer default, NOT user-confirmed); new invoices can differ from the old truncation by up to 1 fil per line; existing data untouched | 2026-10-28 |
| D5 | Postgres trigger enforcement acceptable? | | |
| D6 | Cheque/PDC scope | | |
| D7 | Allow negative stock or block | | |
| D8 | P0.3: keep generated client committed, or add prisma generate to build? | PROPOSED (reviewer recommendation): keep generated client committed; P0.3 dropped. NOT yet user-confirmed | 2026-10-27 |
| D9 | Keep demo/reset action in production (with env guard), or remove entirely? Reviewer recommends removal; AuditLog rows must NEVER be deleted either way | OPEN (user decision) | 2026-10-27 |
| D10 | Reversal date policy: default today; must be >= original entry date; must fall in an OPEN fiscal year | reviewer default, NOT user-confirmed | 2026-10-27 |
| D11 | Voided payments KEEP their PaymentAllocation rows (excluded everywhere by payment status filter, never hard-deleted) | reviewer default, NOT user-confirmed | 2026-10-27 |
| D12 | Should the generic reversal apply to YEAR_END_CLOSE or OPENING_BALANCE entries? Reversing a year-end close is not a normal void | reviewer default: reverseJournalEntry REJECTS sourceType YEAR_END_CLOSE with a clear message — NOT user-confirmed; OPENING_BALANCE unaddressed so far | 2026-10-27 |
| D13 | OPENING_BALANCE and all non-MANUAL entries cannot be voided from the journals screen | reviewer default, NOT user-confirmed | 2026-10-28 |
| D14 | Line value (qty x rate) truncates to whole fils while VAT rounds half-up (D4), e.g. 333 fils x 0.333 = 110 | OPEN - no change proposed | 2026-10-28 |
| D15 | F12 fix: reject more than 3 decimals vs round half-up to 3 first | recommended: reject; NOT user-confirmed | 2026-10-28 |
| D16 | Reject zero quantity on invoice lines | recommended: reject; NOT user-confirmed (demo data qty always > 0) | 2026-10-28 |

---

### Known issues (partyLedger labels)

Tracked as F13; fix scheduled inside P1.5 as its own commit.

---

## Working Standards

1. Every schema-changing commit MUST include the regenerated `src/generated/prisma` client, because the VPS build runs `npm ci && npx next build` with no `prisma generate`.
2. Minimal-footprint, additive changes. Prefer new nullable columns/new tables/new files over rewriting existing ones. No refactors outside the approved task.
3. Fixes scoped to CONFIRMED bugs only (F-items marked CONFIRMED).
4. One concern per commit (separate commits for schema, logic, UI, tests, docs) so each can be rolled back alone. Conventional messages, e.g. "fix(accounting): ...".
5. Every shipped change gets an append-only entry in /LEDGER.md (date, task ID, what, files, commit hash, verification evidence).
6. Every new/changed money path: atomic inside prisma.$transaction; BigInt only (no floats); idempotency where a client retry could double-post; console.error in every catch block.
7. Every new server action/route: tests for unauthenticated AND wrong-role/insufficient-permission access, using the existing requireModule/guard patterns.
8. Every destructive or irreversible user action (void, amend, delete, reversal) requires a typed confirmation in the UI and a mandatory reason string stored in AuditLog.
9. Tests: happy path AND negative cases for every task (closed fiscal year, over-allocation, wrong party, unbalanced entry, wrong direction, insufficient permission, concurrent request, etc.). For every bug fix, the negative test must reproduce the ORIGINAL failure: temporarily revert the fix, show the test FAILS (literal output), restore the fix, show it PASSES (literal output).
10. Build verification must use the EXACT production build command and flags the project deploys with (find it in package.json / deploy docs and state it in the plan). Do not substitute tsc --noEmit or an "equivalent" check.
11. Database safety: all migrations and tests run against a local DEV/TEST database only. NEVER connect to production. For production, produce a reviewed .sql file for me to apply; do not inline SSH/SQL quoting.
12. Verification = LITERAL command output pasted in full (git status, git diff --stat, exact build command, test runner, relevant SQL/Prisma query results). No self-written summaries standing in for output.
13. Do not alter existing posted data. Backfills are separate, reviewed, idempotent scripts with a dry-run mode.
14. Keep EN/AR i18n: any new user-facing string goes through src/lib/i18n.ts with both languages. Keep existing print templates working (App default, Emirates Classic, Emirates Modern).

---

## Deploy
- Command: `git pull && npm ci && npx next build && pm2 restart scrapbooks` (run on VPS via `ssh scrapbooks-vps "cd /root/scrapbooks && git pull && npm ci && npx next build && pm2 restart scrapbooks"`)
- Source: executed on VPS on 2026-10-27 via ssh following the user's "deploy" instruction; not yet recorded from a repo deploy script (none exist in-repo)
- Schema-changing commits: apply the ops/sql SQL on production BEFORE deploying (the committed client selects the new columns — deploying code first breaks the app)

---

## PHASE 0 — Foundations

| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P0.1 | Create ROADMAP.md and LEDGER.md | DONE | — | 09b2752, 0f0e613 | 2026-10-27 (build evidence in LEDGER.md) | Acknowledged by reviewer |
| P0.2 | Vitest + test DB harness (npm test, test:db) | DONE | — | 8de6495, 9dc493b, b4659d0, f1dc3a3, 8b2bd26, e432693, cc1904d, fe6e5cc, 4336360, b016407, 901a7bb, 752e21f | 2026-10-27 (evidence in LEDGER.md) | ACKNOWLEDGED by reviewer |
| P0.3 | Decision: keep generated client committed (DROPPED) | BLOCKED | D8 | | | build is "next build" with no generate step; D8 awaiting user confirmation |
| P0.4 | Replace default README with real docs | PENDING | — | | | Notes: vitest.config.ts is loaded as CJS with ESM syntax (Vite warning); do NOT rename to .mts without replacing __dirname |

---

## PHASE 1 — Integrity Fixes (only CONFIRMED findings)

| ID | Task | Finding | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|---|
| P1.1 | Void by reversal: mirrored POSTED entry, FY check, AuditLog | F1 | DONE | P0.1, P0.2 | daa4563, a98412f, 93b5a8d, 418f730, bf733fb, 30ca9c5, ff04de4, e1f2b3f, 8bc24e3, c974ed0, 6054e32, 8e63b5b | 2026-10-28 | Complete: reversal-based void for invoices (voidInvoiceWithReversal) and payments (voidPaymentWithReversal), lock-first order invoices→payment→entries→Serial, D11 active-allocation guard (allocations kept, excluded by payment status everywhere), D12 YEAR_END_CLOSE reject (reviewer default), DRAFT-only legacy voidJournalEntry (accounting.ts:143), void actions in invoice-actions.ts/payments actions with mandatory reason + AuditLog, legacy voidInvoice/voidPayment removed (commit 5), UI dialogs EN+AR |
| P1.1b | Manual journal void via reversal (F11): mandatory reason, Dubai date, MANUAL-only source guard, DRAFT-only direct voids | F11 | DONE | P1.1 | 6e610ad | 2026-10-28 | Manual journal void now routes through reverseJournalEntry (mirrored POSTED reversal, reversesEntryId link); POSTED entries reversed, DRAFT entries voided directly via voidJournalEntry without reversal, VOID entries rejected; non-MANUAL entries (invoice, payment, receipt, REVERSAL, OPENING_BALANCE, YEAR_END_CLOSE) rejected with "void the source document instead"; UI void dialog with mandatory reason textarea EN+AR; concurrency test on the entry row lock (double void serialized, exactly one reversal) |
| P1.2 | Lock invoice row on allocation (FOR UPDATE) + per-invoice aggregation (F2, F2b) | F2 | DONE | P0.2 | 0e183dc, 9175dc6 | 2026-10-27 | lockInvoices helper (ORDER BY id FOR UPDATE, Prisma.join); SUM per invoice; concurrency via pg_stat_activity polling |
| P1.3 | voidPayment handles allocations explicitly | F3 | DONE | P0.1, P0.2 | e1f2b3f, 6054e32, 8e63b5b | 2026-10-28 | Allocations KEPT (D11); voidPaymentWithReversal reverses the payment entry and flips status; PaymentAllocation rows excluded everywhere by payment status filter |
| P1.4 | Half-up rounding helpers; document VAT method | F4 | DONE | P0.2, D4 | c3b549a, 4b2e17a | 2026-10-28 | roundHalfUpDiv + vatForLine in money.ts (half away from zero, BigInt only); createInvoice now uses vatForLine per line; new invoices can differ from the old truncation by up to 1 fil per line; existing stored invoices untouched; pinning tests in tests/unit/money-rounding.test.ts + tests/db/invoice-rounding.test.ts |
| P1.5 | trialBalance via groupBy; accountLedger uses normalBalance | F6, F13 | PENDING | P0.1, P0.2 | | | Follow accountBalances pattern (src/lib/accounting.ts:294, signFor). (a) trialBalance groupBy done in 94518ca; (b) accountLedger normalBalance and (c) F13 pending |
| P1.6 | DB triggers: immutability + balance check | F7 | PENDING | P0.1, P0.2, D5 | | | Must not break reversal flow |
| P1.7 | Duplicate vendor invoice guard (partial unique index) | F7 | PENDING | P0.1, P0.2 | | | Scan existing data first |
| P1.8 | Idempotency keys on all financial create endpoints | F9 | PENDING | P0.2 | | | Invoice, payment, journal create actions |
| P1.9 | Remove or environment-gate resetDemoData; never delete AuditLog | F10 | PENDING | P0.2, D9 | | | User decision D9 needed before build |

### Phase 1 switching table (legacy callers -> new call sites)

Legacy `voidInvoice` / `voidPayment` / `voidJournalEntry` stay temporarily; every UI action
switches to the reversal-based functions in commit (4) (P1.1 actions/permissions layer):

| Legacy function | Called by | Switch to | Target commit |
|---|---|---|---|
| `voidInvoice` | `src/lib/invoice-actions.ts:114-120` (`voidInvoiceAction` — permission check, audit, revalidate) | `voidInvoiceWithReversal` (+ AuditLog + reversal reason surfaced to the dialog) | (4) |
| `voidPayment` | `src/app/(app)/payments/actions.ts:65-68` (`voidPaymentAction`) | `voidPaymentWithReversal` (+ AuditLog + reason) | (4) |
| `voidJournalEntry` (legacy) | now DRAFT-only (`src/lib/accounting.ts:143`); called only by `voidInvoiceWithReversal`'s DRAFT branch and `tests/db/accounting.test.ts` | removed — legacy callers gone | (5) |

Removal complete in commit (5): `voidInvoice` and `voidPayment` deleted (no callers remain; `scripts/test-invoices.ts` re-pointed to `voidInvoiceWithReversal`); `voidJournalEntry` is DRAFT-only with POSTED/VOID rejections; no caller reaches the legacy voids outside `voidInvoiceWithReversal`'s DRAFT branch.

---

## PHASE 2 — Receivables & Partial Payments
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P2.1 | Invoice dueDate + payment terms | PENDING | P1.1 | | | |
| P2.2 | Derived payment status (UNPAID/PARTIAL/PAID/OVERDUE) | PENDING | P2.1 | | | |
| P2.3 | Unallocated payment (advance) tracking | PENDING | P2.1 | | | |
| P2.4 | Customer/vendor statements + aging buckets | PENDING | P2.2 | | | |
| P2.5 | Cheque register + PDC clear/bounce (design only) | PENDING | D6 | | | |
| P2.6 | Credit/debit notes (F7): model, posting, print, VAT effect | PENDING | P1.1, D1 | | | |

## PHASE 3 — Deductions & Amendment
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P3.1 | InvoiceDeduction model + posting rules + print | PENDING | P1.1, D1 | | | |
| P3.2 | InvoiceRevision + amend flow (uses P1.1 reversal) | PENDING | P1.1, P3.1, D3 | | | |
| P3.3 | Print templates show deductions + "Rev N" | PENDING | P3.2 | | | |

## PHASE 4 — Delivery Notes & Item Ledger
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P4.1 | DeliveryNote + DeliveryNoteLine + Serial | PENDING | P3.2 | | | |
| P4.2 | DN→Invoice linking (many:1, partial) | PENDING | P4.1 | | | |
| P4.3 | DN-level deductions (shortage/contamination) | PENDING | P3.1, P4.1 | | | |
| P4.4 | StockMovement, valuation, inventory account (1140), COGS | PENDING | P4.1, D2, D7 | | | |
| P4.5 | Opening stock backfill (idempotent, dry-run) | PENDING | P4.4 | | | |

## PHASE 5 — Reporting
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P5.1 | VAT 201 return (FTA layout) | PENDING | P1.4, P2.6, P3.1, D1 | | | |
| P5.2 | Invoice register + CSV/XLSX | PENDING | P1.5 | | | |
| P5.3 | Item ledger + stock valuation | PENDING | P4.4 | | | |
| P5.4 | Item-wise sales/purchase + margin | PENDING | P4.4 | | | |
| P5.5 | Deductions summary | PENDING | P3.1 | | | |
| P5.6 | Day book, cash book, bank book | PENDING | P1.5 | | | |
| P5.7 | Cash flow statement (cashFlowClass) | PENDING | P1.5 | | | |
| P5.8 | Comparative P&L (monthly/YoY) | PENDING | P1.5 | | | |
| P5.9 | Audit trail report (amendments, voids) | PENDING | P3.2 | | | |

## PHASE 6 — Hardening
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P6.1 | AuditLog before/after values (structured) | PENDING | P1.1 | | | |
| P6.2 | E-invoicing readiness (UBL/PINT-AE structure) | PENDING | D1 | | | |
| P6.3 | Backup/restore & deployment runbook | PENDING | — | | | |