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

## Findings (F1-F10 Verification)

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
| F2b | Allocation validation checks each row against outstandingForInvoice independently and the action schema has no duplicate guard, so two rows for one invoice (700+700 vs outstanding 1000) both pass | CONFIRMED | payments.ts:76-104; payments/actions.ts:24-25 |

---

## Decisions

| ID | Decision | Answer | Date |
|---|---|---|---|
| D1 | VAT treatment of deduction types (pre-VAT vs post-VAT) | | |
| D2 | Inventory valuation method (weighted avg proposed) | | |
| D3 | Who may amend posted invoices (ACCOUNTANT/ADMIN, second approval?) | | |
| D4 | VAT calculation: per-line vs per-invoice | | |
| D5 | Postgres trigger enforcement acceptable? | | |
| D6 | Cheque/PDC scope | | |
| D7 | Allow negative stock or block | | |
| D8 | P0.3: keep generated client committed, or add prisma generate to build? | PROPOSED (reviewer recommendation): keep generated client committed; P0.3 dropped. NOT yet user-confirmed | 2026-10-27 |
| D9 | Keep demo/reset action in production (with env guard), or remove entirely? Reviewer recommends removal; AuditLog rows must NEVER be deleted either way | OPEN (user decision) | 2026-10-27 |
| D10 | Reversal date policy: default today; must be >= original entry date; must fall in an OPEN fiscal year | reviewer default, NOT user-confirmed | 2026-10-27 |
| D11 | Voided payments KEEP their PaymentAllocation rows (excluded everywhere by payment status filter, never hard-deleted) | reviewer default, NOT user-confirmed | 2026-10-27 |
| D12 | Should the generic reversal apply to YEAR_END_CLOSE or OPENING_BALANCE entries? Reversing a year-end close is not a normal void | reviewer default: reverseJournalEntry REJECTS sourceType YEAR_END_CLOSE with a clear message — NOT user-confirmed; OPENING_BALANCE unaddressed so far | 2026-10-27 |

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
| P0.3 | Decision: keep generated client committed (DROPPED) | PENDING | D8 | | | build is "next build" with no generate step; D8 awaiting user confirmation |
| P0.4 | Replace default README with real docs | PENDING | — | | | Notes: vitest.config.ts is loaded as CJS with ESM syntax (Vite warning); do NOT rename to .mts without replacing __dirname |

---

## PHASE 1 — Integrity Fixes (only CONFIRMED findings)

| ID | Task | Finding | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|---|
| P1.1 | Void by reversal: mirrored POSTED entry, FY check, AuditLog | F1 | IN_PROGRESS | P0.1, P0.2 | daa4563, a98412f, 93b5a8d, 418f730, bf733fb, (2b) | 2026-10-27 (checkpoint) | Original stays POSTED; reversal linked by reversesEntryId; sourceType REVERSAL with REV prefix; reversal lines copy partyId+description; FK ON DELETE NO ACTION; commit (2) accounting core done — (2b) fixes in progress |
| P1.2 | Lock invoice row on allocation (FOR UPDATE) + per-invoice aggregation (F2, F2b) | DONE | F2 | P0.2 | 0e183dc, 9175dc6 | 2026-10-27 | lockInvoices helper (ORDER BY id FOR UPDATE, Prisma.join); SUM per invoice; concurrency via pg_stat_activity polling |
| P1.3 | voidPayment handles allocations explicitly | F3 | PENDING | P0.1, P0.2 | | | Consistent with voidInvoice |
| P1.4 | Half-up rounding helpers; document VAT method | F4 | PENDING | P0.2, D4 | | | Additive in money.ts |
| P1.5 | trialBalance via groupBy; accountLedger uses normalBalance | F6 | PENDING | P0.1, P0.2 | | | Follow accountBalances pattern |
| P1.6 | DB triggers: immutability + balance check | F7 | PENDING | P0.1, P0.2, D5 | | | Must not break reversal flow |
| P1.7 | Duplicate vendor invoice guard (partial unique index) | F7 | PENDING | P0.1, P0.2 | | | Scan existing data first |
| P1.8 | Idempotency keys on all financial create endpoints | F9 | PENDING | P0.2 | | | Invoice, payment, journal create actions |
| P1.9 | Remove or environment-gate resetDemoData; never delete AuditLog | F10 | PENDING | P0.2, D9 | | | User decision D9 needed before build |

---

## PHASE 2 — Receivables & Partial Payments
| ID | Task | Status | Depends on | Commit(s) | Verified | Notes |
|---|---|---|---|---|---|---|
| P2.1 | Invoice dueDate + payment terms | PENDING | P1.1 | | | |
| P2.2 | Derived payment status (UNPAID/PARTIAL/PAID/OVERDUE) | PENDING | P2.1 | | | |
| P2.3 | Unallocated payment (advance) tracking | PENDING | P2.1 | | | |
| P2.4 | Customer/vendor statements + aging buckets | PENDING | P2.2 | | | |
| P2.5 | Cheque register + PDC clear/bounce (design only) | PENDING | D6 | | | |

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
| P5.1 | VAT 201 return (FTA layout) | PENDING | P1.4 | | | |
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