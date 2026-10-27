import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Pure check: a buffer starts with the UTF-8 BOM (EF BB BF). */
export function hasBom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

describe("hasBom (pure)", () => {
  it("detects a leading BOM", () => {
    expect(hasBom(Buffer.from([0xef, 0xbb, 0xbf, 0x73, 0x71, 0x6c]))).toBe(true);
  });
  it("does not flag content without a BOM", () => {
    expect(hasBom(Buffer.from("SELECT 1;", "utf8"))).toBe(false);
    expect(hasBom(Buffer.alloc(0))).toBe(false);
  });
});

// A BOM at the start of a .sql file breaks psql -f with "syntax error at or near"
// (P3018 precedent); a BOM in committed files is therefore forbidden.
const repoRoot = path.resolve(__dirname, "..", "..");
function collectSql(dir: string, acc: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectSql(p, acc);
    else if (p.endsWith(".sql")) acc.push(p);
  }
  return acc;
}
const sqlFiles = [
  ...collectSql(path.join(repoRoot, "prisma", "migrations"), []),
  ...collectSql(path.join(repoRoot, "ops", "sql"), []),
];

describe("committed .sql files carry no BOM", () => {
  it("every prisma/migrations and ops/sql .sql file starts with SQL, not a BOM", () => {
    expect(sqlFiles.length).toBeGreaterThan(0);
    const offenders = sqlFiles.filter((p) => hasBom(readFileSync(p)));
    expect(offenders.map((p) => path.relative(repoRoot, p))).toEqual([]);
  });
});
