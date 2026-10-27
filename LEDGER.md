# SCRAPBOOKS — LEDGER (Append-only log of shipped changes)

## Format
Each entry:
```
### <YYYY-MM-DD> | <Task ID> | <Commit hash>
**What:** <one line>
**Files:** <paths>
**Verification:** <literal command outputs / evidence refs>
```

---

### 2026-10-27 | P0.1 | 09b2752
**What:** Added ROADMAP.md (phases 0-6, findings F1-F9, decisions, working standards, deploy command) and LEDGER.md tracking files.
**Files:** ROADMAP.md, LEDGER.md
**Verification:**
- `git log -3 --oneline`: `09b2752 docs: add ROADMAP.md and LEDGER.md tracking files`; `b102c67`; `cba5f88`
- `git status --short`: clean (no output)
- `git diff --stat HEAD~2`: LEDGER.md +12, ROADMAP.md +138, EmiratesInvoiceView.tsx +4, InvoicePrintView.tsx +4 (latter two from prior commit b102c67)
- Production build `npx next build`: compiled successfully, TypeScript passed, 28 pages generated

### 2026-10-27 | CORRECTION to P0.1 entry | 0f0e613
**What:** The P0.1 evidence diff-stat above was taken against `HEAD~2` at the wrong moment and incorrectly included files from the unrelated earlier commit `b102c67`. Correct per-commit evidence is below (existing entry left unchanged; LEDGER is append-only).
**Verification (literal):**
```
$ git show --stat 09b2752
commit 09b27523493dc7f833e79899163629eef759a8df
    docs: add ROADMAP.md and LEDGER.md tracking files
 LEDGER.md  |  12 ++++++
 ROADMAP.md | 138 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 150 insertions(+)

$ git show --stat 0f0e613
commit 0f0e613c13a934f3e53bf93a83b6e7fa24d5fcec
    docs: record P0.1 in LEDGER (commit 09b2752, build evidence)
 LEDGER.md | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)
```

### 2026-10-27 | P0.2 (partial — guard phase) | 9dc493b, b4659d0
**What:** Vitest deps/config/lockfile (8de6495); pure database guard with unit tests (9dc493b); bypass fix — query-param host/port overrides in pg-connection-string rejected, only `schema`/`sslmode` allowed on the test URL, dead fallback-name rule removed (b4659d0, amended earlier from 7214b64 pre-push).
**Files:** package.json, package-lock.json, vitest.config.ts, tests/db-guard.ts, tests/unit/db-guard.test.ts
**Verification (literal):**
- `npm test`: `Test Files 1 passed (1)`, `Tests 14 passed (14)` (guard: happy + missing/equal/suffix/non-local-host negatives + ?host/?port/?dbname/?hostaddr override negatives + ?schema happy + main-URL-override sameness)
- `npm ci --dry-run`: `up to date in 20s` (lockfile matches package.json)
- `npm audit`: `2 vulnerabilities (1 moderate, 1 high)` — identical to pre-vitest baseline; vitest adds none
- Exact prod build `npx next build`: first run FAILED `tests/db-guard.ts(66,19): error TS2345` (genuine type bug in test code; tsconfig untouched); fixed and build passed (`BUILD_EXIT=0`)

### 2026-10-27 | P0.2 (harness + extraction + tests) | f1dc3a3..fe6e5cc
**What:** Lenient-parser rename + fail-closed messaging (f1dc3a3); db harness — globalSetup reads main URL from the .env FILE via dotenv.parse, migrate deploy as child process with DATABASE_URL explicitly set to the validated test URL (printed target proof: `Datasource "db": PostgreSQL database "scrapbooks_test"`), per-worker setupFile validating before @/lib/db import, ground-truth `SELECT current_database()` abort check before every TRUNCATE, dynamic information_schema TRUNCATE (double-quoted identifiers, excluding _prisma_migrations), Mode A/B helpers (8b2bd26); prisma/coa.ts extraction with seed.ts importing it (e432693); seedTestData + accounting smoke tests, Mode A for tx functions / Mode B for committed void characterization (cc1904d); typing fixes found by the exact prod build (fe6e5cc); .env.test.example + gitignore negation (4336360).
**Files:** tests/global-setup.ts, tests/db/{setup,helpers,seed,connection,accounting}.test.ts, vitest.config.ts, prisma/coa.ts, prisma/seed.ts, .env.test.example, .gitignore
**Verification (literal):**
- Seed BEFORE extraction (unmodified seed.ts, test DB `scrapbooks_test`): `Seed complete: users, COA (25 accounts), FY2026, items, parties`
- Seed AFTER extraction: identical `Seed complete: users, COA (25 accounts), FY2026, items, parties`
- `npm test`: `Test Files 1 passed (1)`, `Tests 14 passed (14)`
- `npm run test:db`: `Test Files 2 passed (2)`, `Tests 7 passed (7)` — incl. `worker is connected to the validated TEST database` ground-truth test
- Worker targeting proof (globalSetup output): `[migrate] Datasource "db": PostgreSQL database "scrapbooks_test", schema "public" at "localhost:54322"`, `[db-guard] guard OK: test DB "scrapbooks_test" on localhost:54322; main is localhost:54322/scrapbooks`
- Exact prod build `npx next build *> build.log`: `EXIT=0` (Compiled successfully; TypeScript finished; 28/28 pages; test files present)

### 2026-10-27 | P0.2 correction (non-buildable intermediate commits) | fe6e5cc
Per reviewer finding #4: commits 8b2bd26, e432693 and cc1904d do NOT pass `npx next build` in
isolation (TS2322/TS2769/TS2322 in prisma/coa.ts, tests/db/helpers.ts, tests/db/accounting.test.ts
— fixed by fe6e5cc). fe6e5cc is the FIRST deployable commit; do not cut a release at any earlier
commit. History NOT rewritten (per instruction, after the amend mishap earlier today).

### 2026-10-27 | Reviewer follow-up commit (P0.2 findings #1-#3, #6) | test-negatives commit
**What:** pure `assertWorkerUrl(envUrl, validatedUrl)` moved from tests/db/setup.ts inline code to
tests/db-guard.ts (setup.ts now calls it); DB negative test tests/db/ground-truth.test.ts —
tampered harness.guard clone (test.database different), expects truncateAll + assertCurrentDatabase
to reject /GROUND TRUTH MISMATCH/ and verifies seeded user rows SURVIVE, restore in `finally`;
void characterization now asserts `journalEntry.count() === 1` (a falsifiable assertion) instead
of the never-failing entryNo-contains-"REVERSAL" check; unused `harness` import removed; pure
`maskSecret(text, secret)` (split/join, regex-metacharacter-safe) replaces
`new RegExp(guard.testUrl, "g")` in tests/global-setup.ts.
**Verification (literal):**
- MUTATION CHECK: with the ground-truth comparison disabled (`if (false && ...)`), the new test
  FAILED: `× tampered harness context: truncateAll and assertCurrentDatabase reject /GROUND
  TRUTH MISMATCH/ and seeded rows survive` — `stdout | tests/db/ground-truth.test.ts` shown, then
  check restored and the suite passed again.
- `npm test`: `Test Files 1 passed (1)`, `Tests 19 passed (19)` (14 prior + 3 assertWorkerUrl +
  2 maskSecret)
- `npx vitest run --project db --reporter=verbose`: `Test Files 3 passed (3)`, `Tests 8 passed
  (8)` — all 8 test names listed (4 postJournalEntry, 1 assertBalanced, 1 void characterization,
  1 ground-truth abort, 1 worker connection ground truth)
- `npx next build *> build.log`: `EXIT=0`; log includes compilation, TypeScript finish, all
  34 route lines (`ƒ`/`?` markers), 28/28 static pages — pasted in full before deletion.
**Any TRUNCATE performed in this session was executed only via the guarded truncateAll helper;
no ad-hoc docker exec TRUNCATE (the one reported earlier is corrected here).**

### 2026-10-27 | P0.2 close-out (encoding repair + reviewer items #2-#5) | close-out commit
**Encoding:** every file touched this session was validated with Node
TextDecoder("utf-8", {fatal:true}) + U+FFFD scan. Result: 13 of 14 files OK;
LEDGER.md FAILED (7 invalid sequences) because Add-Content wrote em dashes, × and
ƒ as CP1252 single bytes (0x97/0xD7/0x83). Repair was byte-surgical (encoding only,
content untouched): the 7 corrupt bytes were spliced to their correct UTF-8 forms; the
existing valid UTF-8 sequences (e2 80 94) elsewhere in the file were left alone. After
repair: fatal decode OK, U+FFFD count 0, git diff limited to 6 line pairs (the corrupt
symbols). FUTURE RULE: append/write files ONLY via Node fs or
[IO.File]::WriteAll/AppendAllText with [Text.UTF8Encoding]::new($false) — never
Add-Content/Set-Content/Out-File in this repo.

**Ad-hoc TRUNCATE, stated plainly:** during the coa.ts extraction step, a manual
`docker exec ... psql -c 'TRUNCATE TABLE "User" CASCADE'` was attempted against
scrapbooks_test; it failed on PowerShell quoting (relation public.user does not
exist), so nothing was truncated. It bypassed the guarded harness and must not recur.

**Masking hardening:** new pure maskUrl(text, url) in tests/db-guard.ts — masks the
full URL and additionally the parsed password (URL.password, raw and
percent-decoded forms), still split/join (regex-metacharacter safe); used in
tests/global-setup.ts for migrate output and failure output. Unit tests cover a
password containing percent-encoded metacharacters (p%2Fss%3Fword), a truncated-URL
leak case, and empty password.

**Other:** ROADMAP heading renamed to Findings (F1-F10 Verification); P0.2 row DONE
(commits now include b016407, 901a7bb, 752e21f) and P0.4 gains the vitest.config.ts
CJS/ESM tech-debt note; tests/db/helpers.ts header states every DB test file must
start with truncateAll(prisma) (the first ground-truth run collided on User_email
because it lacked that truncate — now fixed in the test itself).

### 2026-10-27 | P1.2 lock + F2b aggregation (build round)
**What (ONE concern):** src/lib/payments.ts - exported lockInvoices(tx, ids): dedupe+sort
ids, SELECT id FROM "Invoice" WHERE id IN (...) ORDER BY id FOR UPDATE via Prisma.sql/
Prisma.join (parameterized, never interpolated; ORDER BY REQUIRED - IN-list order does not
guarantee Postgres lock order), returns sorted unique ids for caller reuse. createPayment
takes the lock FIRST, before any status/direction/outstanding read. F2b fixed: allocation
validation previously checked each row independently (payments.ts:76-104), and the action
schema had no duplicate guard (payments/actions.ts:24-25), so two rows for one invoice
(700+700 vs outstanding 1000) both passed; validation now SUMS allocations per invoiceId
and compares each total to the outstanding balance.
**Mojibake scan (STEP 0, read-only):** all 14 session-touched files CLEAN (scan = U+00C2/
U+00C3/U+00E2 followed by U+0080-00BF / U+20AC / U+2018-201E); no double-encoded text
found; nothing repaired.
**Tests (tests/db/payments.test.ts, starts with truncateAll):** happy; > outstanding;
duplicate rows exceeding outstanding (F2b); allocations > payment; wrong party; wrong
direction; VOID invoice; CONCURRENCY.
**CONCURRENCY protocol (deterministic, no timing luck - amendments 3+4):** tx1 runs
createPayment in full inside an open interactive tx (timeout 30s), signals, holds. tx2
starts UNAWAITED; the test polls pg_stat_activity (wait_event_type='Lock') until tx2 is
actually BLOCKED, which proves tx2's validation reads completed strictly before tx1
commits; only then the gate releases and tx1 commits. Assertions are on the final outcome
ONLY: tx1 fulfilled, tx2 rejected /exceeds the invoice outstanding/,
SUM(PaymentAllocation.amountFils) <= invoice.totalFils (=700). NO assertion about
"being blocked" is used as a pass condition.
**Mutation proofs (literal):**
- MUTANT A (lock removed): test FAILED - "Test Files 1 failed (1) / Tests 1 failed | 7
  skipped (8)" on the final-outcome assertion; the polled BLOCKED query printed tx2
  waiting on "Serial": INSERT INTO "public"."Serial" ... ON CONFLICT - amendment 4
  predicted exactly this (serial blocking alone must not satisfy the outcome). Restored:
  blocked query = "SELECT id FROM \"Invoice\" WHERE id IN ($1) ORDER BY id FOR UPDATE",
  test PASSES - proof the LOCK is what made tx2 fail.
- MUTANT B (per-invoice SUM check removed): 3 tests failed ("> outstanding", the F2b
  duplicate-rows test, and the concurrency outcome test); restored: pass.
**Evidence (literal):** npm test: Tests 22 passed (22); npx vitest run --project db
--reporter=verbose: createPayment 8 tests (happy, 6 negatives incl. F2b, concurrency with
poll log), accounting 6, ground-truth 1, connection 1 - Test Files 4 passed (4), Tests 16
passed (16); npx next build *> build.log: EXIT=0 (Compiled successfully).
**One honest flaw found and fixed during the build:** the first version of the
concurrency test PASSED with MUTANT A applied (timing luck: tx1's commit raced tx2's
validation). Rebuilt as the pg_stat_activity polling protocol above; now both mutants
fail deterministically.
**Guard rails kept:** every TRUNCATE via guarded truncateAll; LEDGER appended via Node
UTF-8 no BOM (never Add-Content); no push (public repo + F10 documented locally).
**ROADMAP:** F2b added under Findings (F1-F10) as CONFIRMED (payments.ts:76-104,
payments/actions.ts:24-25) under task P1.2; P1.2 IN_PROGRESS awaiting acknowledgment.

### 2026-10-27 | P1.2 close-out (reviewer items 1-5) | close-out commit
1. Precise F2b mutant: per-row outstanding comparison restored (ignoring the per-invoice
sum). Literal result: ONLY "negative (F2b): duplicate rows for one invoice exceeding
outstanding reject (aggregation)" FAILED ("promise resolved {promise resolved 15-key
payment object} instead of rejecting"); single-row "> outstanding" test PASSED - proving
the AGGREGATION (not merely the check) is what the test guards. Fix restored.
2. src/lib/payments.ts: single declaration of expectedDirection (line 92), no duplicate;
tests/db/payments.test.ts debug console.log("BLOCKED ON") REMOVED (poll remains for
determinism; asserted nothing on it).
3. ROADMAP P1.2 row: DONE, Commits 0e183dc, 9175dc6 (+close-out commit), Verified
2026-10-27, Notes name F2 + F2b, lockInvoices, pg_stat_activity polling.
4. Character scan (mojibake + CJK/full-width U+3000-U+9FFF, U+FF00-U+FFEF):
   CLEAN: src/lib/payments.ts / tests/db/payments.test.ts / LEDGER.md / ROADMAP.md.
5. Evidence: npm test = Tests 22 passed (22); npx vitest run --project db = Test Files 4
passed (4), Tests 16 passed (16); npx next build *> build.log: EXIT=0, full log (34
routes, 28/28 pages) pasted at generation time.

### 2026-10-27 | P1.1 COMMIT (1) - schema + migrations + regenerated client | daa4563
**Schema (additive only):** EntrySource gains REVERSAL (single-statement migration
20261027062727_add_reversal_source: ALTER TYPE "EntrySource" ADD VALUE 'REVERSAL';);
JournalEntry gains unique nullable reversesEntryId + named self-relation
"JournalEntryReversal" (reversesEntry/reversedBy), migration
20261027064800_journal_entry_reversal_link: AlterTable + CreateIndex + AddForeignKey
(ON DELETE SET NULL). Old code unchanged; build verified green on the new client.
**Procedure (honest):** prisma migrate dev --create-only was attempted THREE times;
Prisma 7 CLI hard-requires a TTY ("environment is non-interactive ... is not
supported" - literal) and prisma 7 removed --from-url/--accept-data-loss, so the SQL
was authored via "npx prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --script" with DATABASE_URL explicitly set to
postgresql://scrap:***@localhost:54322/scrapbooks_test (printed target line:
'Datasource "db": PostgreSQL database "scrapbooks_test", schema "public" at
"localhost:54322"'). NEVER migrate reset; the test DB received migration B via
npx prisma migrate deploy (same explicit env), which first FAILED on a UTF-8 BOM
prepend (P3018, syntax error at position 1) - BOM removed via Node, migration marked
rolled-back via migrate resolve --rolled-back, deploy re-run: "All migrations have
been successfully applied."
**HONEST DISCLOSURE - dev DB touched:** one aborted attempt (command that piped
stdin while the explicit env had NOT been set in that invocation) targeted the DEV
database "scrapbooks" and APPLIED migration add_reversal_source (ADD VALUE -
additive, no data change) to the DEV database. Recorded here; pass 2+ targeted
scrapbooks_test. Per reviewer note, the user will additionally run
"npx prisma migrate deploy" on the DEV database to bring it to 8 migrations.
**Production packaging:** ops/sql/20261027_p11_commit1_reversal_link.sql (user-applied;
statements separate, no explicit tx; commented SELECT version() check; commented
rollback block; enum value is NOT droppable - documented).
**Generated client scope (git diff --stat):** enums.ts (3 +-), internal/class.ts (8 +-),
internal/prismaNamespace(ts) (3 +-), models/JournalEntry.ts (393 +-); 5 files changed,
396 insertions(+), 14 deletions(-). In the SAME commit as schemas per D8/deploy rule.
**Postgres version (test DB):** PostgreSQL 16.13 (Alpine musl) - ADD VALUE outside
tx supported.
**Evidence:** npm test = Tests 22 passed (22); npx vitest run --project db = Test
Files 4 passed (4), Tests 16 passed (16); npx next build *> build.log = EXIT=0 (full
log pasted at generation time, 34 routes / 28 pages); git status clean after commit.
**STOP = CHECKPOINT after commit (1); no push; commit (2) (accounting core + tests +
mutation proofs) waits for reviewer CONTINUE.**

### 2026-10-27 | P1.1 COMMIT (1b) - reviewer fixes to commit (1) | 93b5a8d
1. FK action: schema + migration B edited IN PLACE (test-DB-only migration),
   FK now ON DELETE NO ACTION ON UPDATE CASCADE (bulk deleteMany still possible via
   statement-end checks; single-delete of an origin with a live reversal is blocked).
   Regenerated client: internal/class.ts 2 +- (generated onDelete constant only).
   Test DB recreated via SQL file piped to docker psql (DROP/CREATE "scrapbooks_test"
   OWNER "scrap", literal output: DROP DATABASE / CREATE DATABASE); all 8 migrations
   re-applied cleanly (migrate deploy, target printed).
2. BOM scan over every session-created/changed file (repeated over prisma/ + ops/ +
   tests/ trees): NO BOMs found (all files EF-BB-BF-free; the migration B BOM had
   already been stripped during the P3018 recovery). New unit test
   tests/unit/no-bom.test.ts: pure hasBom(buffer) with/without BOM + scan enforcing
   no BOM in prisma/migrations + ops/sql .sql files (25 unit tests).
   hasBom MUTATION PROOF: body disabled ("return false &&") -> "detects a leading
   BOM" FAILED (Tests 1 failed | 2 passed (3)); restored -> Tests 25 passed (25).
3. ops/sql/20261027_p11_commit1_reversal_link.sql rewritten via Node (no BOM, first
   bytes 45 45 32 "--"): ADD VALUE comment corrected (own statement; usable-after-tx
   rule on PG>=12), FK route now NO ACTION, header mandates APPLY SQL BEFORE
   DEPLOYING THE CLIENT COMMIT, footer adds migrate resolve --applied instructions.
4. Dev DB: npx prisma migrate deploy with the .env URL in the same invocation -
   printed target: PostgreSQL database "scrapbooks" at localhost:54322; ONLY migration
   B applied; "All migrations have been successfully applied."
5. ROADMAP: P1.1 IN_PROGRESS (commits daa4563, a98412f, 93b5a8d - 1b); D10 + D11
   recorded as "reviewer default, NOT user-confirmed"; Deploy section gains the
   apply-SQL-before-deploy rule.
6. Evidence: git show --stat daa4563 = exactly 9 files (the CompanySettings/Invoice/
   InvoiceLine .ts warnings were pure CRLF-conversion noise; not in the commit).
   npm test = Tests 25 passed (25); npx vitest run --project db --reporter=verbose
   = all names listed (8 payments, 6 accounting, 1 ground-truth, 1 connection):
   Test Files 4 passed (4), Tests 16 passed (16); npx next build *> build.log:
   EXIT=0 (full 34-route log pasted at generation time).
**PROCESS RULES (reviewer-binding, from now on): no prisma migrate dev / reset -
migrate diff + migrate deploy only, DATABASE_URL set in the same invocation, target
printed; files written via Node fs utf8 no-BOM only; every commit passes tests and
the production build on its own.**
