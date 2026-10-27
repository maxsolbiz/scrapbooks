import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
// (P3018 precedent); a BOM in ANY tracked text file is forbidden — the Write tool
// has repeatedly added one on this machine, and unguarded cases slip into commits.
const repoRoot = path.resolve(__dirname, "..", "..");
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".sql", ".prisma", ".css"]);

function trackedTextFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "buffer" });
  return (out.toString("utf8").split("\0").filter(Boolean) as string[])
    .filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(repoRoot, f));
}

describe("every tracked text file carries no BOM", () => {
  it("git ls-files text sources start with content, not a BOM", () => {
    const files = trackedTextFiles();
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((p) => hasBom(readFileSync(p)));
    expect(offenders.map((p) => path.relative(repoRoot, p))).toEqual([]);
  });
});
