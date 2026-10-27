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
