import { describe, it, expect } from "vitest";
import { multiplyFilsByDecimal } from "@/lib/money";

/**
 * Oracle: verbatim copy of the client-side `multiply` function that currently
 * lives in BOTH src/components/invoices/InvoiceForm.tsx:59 and
 * src/components/invoices/InvoiceFormClient.tsx:70 (verified identical).
 */
function legacyClientMultiply(rateFils: bigint, qty: string): bigint {
  const q = qty.trim();
  if (!q || !/^\d+(\.\d{1,3})?$/.test(q)) return 0n;
  const [whole, part = ""] = q.split(".");
  const thousandths = BigInt(whole) * 1000n + BigInt((part + "000").slice(0, 3));
  return (rateFils * thousandths) / 1000n;
}

function callLegacy(rateFils: bigint, qty: string): { kind: "bigint"; value: bigint } | { kind: "throws"; error: string } {
  try {
    return { kind: "bigint", value: legacyClientMultiply(rateFils, qty) };
  } catch (e) {
    return { kind: "throws", error: (e as Error).message };
  }
}

function callServer(rateFils: bigint, qty: string | number): { kind: "bigint"; value: bigint } | { kind: "throws"; error: string } {
  try {
    return { kind: "bigint", value: multiplyFilsByDecimal(rateFils, qty) };
  } catch (e) {
    return { kind: "throws", error: (e as Error).message };
  }
}

describe("multiply parity: legacy client multiply vs multiplyFilsByDecimal", () => {
  // Each row: [rateFils, qty, expectedLegacy, expectedServer]
  // expected values are strings of bigints, or "throws:<message>".
  // Legacy and server are asserted SEPARATELY — never asserted equal to each other.
  // Rows where they differ are marked DIVERGENCE in a comment.
  it.each([
    // Happy path — identical on both
    [1000n, "1", "1000", "1000"],
    [1000n, "1.5", "1500", "1500"],
    [1000n, "2.005", "2005", "2005"],
    [333n, "0.333", "110", "110"],
    [1000n, "0", "0", "0"],
    [1000n, "0.000", "0", "0"],
    [1000000000n, "1000", "1000000000000", "1000000000000"],
    // Boundary: more than 3 decimals — client rejects (0n), server accepts
    [1000n, "1.2345", "0", "1234"], // DIVERGENCE: client rejects >3 decimals
    // Negative — client returns 0n (regex rejects), server throws
    [1000n, "-1", "0", "throws: Invalid quantity: -1"],
    // Empty / whitespace — client returns 0n (empty check first), server throws
    [1000n, "", "0", "throws: Invalid quantity: "],
    [1000n, "  ", "0", "throws: Invalid quantity: "],
    // Non-numeric — client returns 0n (regex fails), server throws
    [1000n, "abc", "0", "throws: Invalid quantity: abc"],
    [1000n, "1,5", "0", "throws: Invalid quantity: 1,5"],
    // Edge cases
    [1000n, "0.5", "500", "500"],
    [1000n, "1.", "0", "throws: Invalid quantity: 1."],
    [1000n, "1e3", "0", "throws: Invalid quantity: 1e3"],
    [1000n, "00.5", "500", "500"],
    [1000n, "1.0005", "0", "1000"], // DIVERGENCE: client rejects 4 decimals, server accepts
    [1000n, ".5", "0", "throws: Invalid quantity: .5"], // client: no leading digit → 0n; server throws
    [1000n, " 2 ", "2000", "2000"], // trimmed → "2"
    [1n, "1000000000000000000000000000000000000000", "1000000000000000000000000000000000000000", "1000000000000000000000000000000000000000"], // 40-digit qty
    [BigInt("1234567890123456789012345678901234567890"), "1", "1234567890123456789012345678901234567890", "1234567890123456789012345678901234567890"],
  ])("rate %s x qty '%s'", (rateFils: bigint, qty: string, expectedLegacy: string, expectedServer: string) => {
    const client = callLegacy(rateFils, qty);
    const server = callServer(rateFils, qty as string);

    // Assert legacy separately
    if (client.kind === "throws") {
      expect(client.error).toBe(expectedLegacy.replace("throws:", ""));
    } else {
      expect(String(client.value)).toBe(expectedLegacy);
    }

    // Assert server separately
    if (server.kind === "throws") {
      expect(server.error).toBe(expectedServer.replace("throws: ", ""));
    } else {
      expect(String(server.value)).toBe(expectedServer);
    }
  });
});

describe("multiplyFilsByDecimal (server source of truth)", () => {
  it.each([
    [1000n, "1", 1000n],
    [1000n, "1.5", 1500n],
    [1000n, "0.333", 333n],
    [1000n, "2.005", 2005n],
    [333n, "0.333", 110n],
  ])("rate %s x qty '%s' -> %s", (rateFils: bigint, qty: string, expected: bigint) => {
    expect(multiplyFilsByDecimal(rateFils, qty)).toBe(expected);
  });

  it("rejects invalid quantities", () => {
    expect(() => multiplyFilsByDecimal(100n, "abc")).toThrow("Invalid quantity: abc");
    expect(() => multiplyFilsByDecimal(100n, "")).toThrow("Invalid quantity: ");
    expect(() => multiplyFilsByDecimal(100n, "-1")).toThrow("Invalid quantity: -1");
    expect(() => multiplyFilsByDecimal(100n, "1.2345")).not.toThrow(); // unlimited decimals OK
  });

  it("accepts number input", () => {
    expect(multiplyFilsByDecimal(100n, 1.5)).toBe(150n);
    expect(multiplyFilsByDecimal(100n, 0)).toBe(0n);
    expect(() => multiplyFilsByDecimal(100n, 1e21)).toThrow("Invalid quantity: 1e+21");
  });
});
