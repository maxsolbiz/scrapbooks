import { describe, it, expect } from "vitest";
import { assertTestDatabase, parseDbUrlLenient } from "../db-guard";

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
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?schema=public&other=1",
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test",
      ),
    ).toThrow(/forbidden query parameter/);
  });

  it("detects sameness when the MAIN url uses a ?host override pointing at the test target", () => {
    // lenient main parsing still applies host/port overrides to the effective target
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@127.0.0.1:54322/scrapbooks_test",
        "postgresql://scrap:scrapdev@elsewhere.invalid:54322/scrapbooks_test?host=127.0.0.1",
      ),
    ).toThrow(/same host:port\/database/);
  });

  it("rejects ?host override on the test URL (pg-connection-string bypass)", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?host=prod.example.com",
        MAIN,
      ),
    ).toThrow(/forbidden query parameter "host"/);
  });

  it("rejects ?port override on the test URL", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?port=6543",
        MAIN,
      ),
    ).toThrow(/forbidden query parameter "port"/);
  });

  it("rejects ?dbname on the test URL", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?dbname=x",
        MAIN,
      ),
    ).toThrow(/forbidden query parameter "dbname"/);
  });

  it("rejects ?hostaddr on the test URL", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?hostaddr=10.0.0.5",
        MAIN,
      ),
    ).toThrow(/forbidden query parameter "hostaddr"/);
  });

  it("accepts ?schema=public on the test URL", () => {
    expect(() =>
      assertTestDatabase(
        "postgresql://scrap:scrapdev@localhost:54322/scrapbooks_test?schema=public",
        MAIN,
      ),
    ).not.toThrow();
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

  it("rejects scrapbooks via the _test suffix rule", () => {
    expect(() =>
      assertTestDatabase("postgresql://scrap:scrapdev@localhost:54322/scrapbooks", MAIN),
    ).toThrow(/must end in "_test"/);
  });

  it("parseDbUrlLenient throws on malformed URLs", () => {
    expect(() => parseDbUrlLenient("not a url")).toThrow(/not a valid URL/);
    expect(() => parseDbUrlLenient("mysql://localhost/scrapbooks_test")).toThrow(/postgres/);
  });

  it("parseDbUrlLenient throws on empty values", () => {
    expect(() => parseDbUrlLenient("")).toThrow(/empty or unset/);
    expect(() => parseDbUrlLenient(undefined)).toThrow(/empty or unset/);
  });
});

