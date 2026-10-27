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
