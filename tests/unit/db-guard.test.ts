import { describe, it, expect } from "vitest";
import { assertTestDatabase, parseDbUrl } from "../db-guard";

const MAIN = "postgresql://scrap:scrapdev@localhost:54322/scrapbooks";

describe("db-guard (pure function, no DB touched)", () => {
  it("passes for a valid local _test URL differing from DATABASE_URL", () => {
    const r = assertTestDatabase(
      "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test",
      MAIN,
    );
    expect(r.test.database).toBe("scrapbooks_test");
    expect(r.main.database).toBe("scrapbooks");
  });

  it("throws when DATABASE_URL_TEST is missing", () => {
    expect(() => assertTestDatabase("", MAIN)).toThrow(/DATABASE_URL_TEST is not set/);
    expect(() => assertTestDatabase(undefined, MAIN)).toThrow(/DATABASE_URL_TEST is not set/);
  });

  it("throws when it resolves to the same host:port/database as DATABASE_URL", () => {
    expect(() =>
      assertTestDatabase("postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test", MAIN),
    ).not.toThrow();
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?schema=public&other=1",
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test",
      ),
    ).toThrow(/same host:port\/database/);
  });

  it("throws when the database name lacks the _test suffix", () => {
    expect(() =>
      assertTestDatabase("postgresql://scrap:scrapdev@localhost:54322/scrapdev", MAIN),
    ).toThrow(/must end in "_test"/);
  });

  it("throws for a non-local host even with a _test name", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://u:p@prod.example.com:5432/scrapbooks_test",
        MAIN,
      ),
    ).toThrow(/not a local host/);
  });

  it("throws for the dev fallback name scrapbooks", () => {
    // "scrapbooks" fails both the _test-suffix rule and, if allowed through, the
    // fallback-name rule — either way the guard must reject it.
    expect(() =>
      assertTestDatabase("postgresql://scrap:scrapdev@localhost:54322/scrapbooks", MAIN),
    ).toThrow(/_test|dev fallback name/);
  });

  it("parseDbUrl throws on malformed URLs", () => {
    expect(() => parseDbUrl("not a url")).toThrow(/not a valid URL/);
    expect(() => parseDbUrl("mysql://localhost/scrapbooks_test")).toThrow(/postgres/);
  });

  it("parseDbUrl throws on empty values", () => {
    expect(() => parseDbUrl("")).toThrow(/empty or unset/);
    expect(() => parseDbUrl(undefined)).toThrow(/empty or unset/);
  });
});
