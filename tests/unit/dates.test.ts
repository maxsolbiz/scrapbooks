import { describe, it, expect } from "vitest";
import { utcMidnightOfDubaiDate, dubaiDateString } from "@/lib/dates";

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

describe("utcMidnightOfDubaiDate", () => {
  it("maps an instant inside the Dubai day to that day's UTC midnight (UTC+4, no DST)", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2026-10-27T09:30:00Z")))).toBe("2026-10-27");
  });

  it("Dubai midnight 20:00Z falls into the NEXT UTC-free instant; equivalent day", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2026-10-27T20:00:00Z")))).toBe("2026-10-28");
  });

  it("near-dubai-midnight instants 30/66 minutes apart map to the SAME calendar day in the ledger as UTC-midnight Dates", () => {
    // 19:59:59Z = 23:59:59 Dubai (Oct 27); 20:00:01Z = 00:00:01 Dubai (Oct 28)
    const beforeMidnight = utcMidnightOfDubaiDate(new Date("2026-10-27T19:59:59Z"));
    const afterMidnight = utcMidnightOfDubaiDate(new Date("2026-10-27T20:00:01Z"));
    expect(beforeMidnight.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(afterMidnight.toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("returns a real UTC midnight (00:00:00.000Z) — no time component", () => {
    const d = utcMidnightOfDubaiDate(new Date("2026-06-15T12:34:56.789Z"));
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 15));
  });

  it("year boundary: 20:00:01Z = 00:00:01 Dubai Jan 1 -> 2027-01-01", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2026-12-31T20:00:01Z")))).toBe("2027-01-01");
  });

  it("leap-year Feb 29 (Dubai date) survives", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2028-02-28T20:30:00Z")))).toBe("2028-02-29");
  });

  it("exact Dubai midnight 20:00:00Z maps to the NEXT calendar day", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2026-10-27T20:00:00Z")))).toBe("2026-10-28");
    expect(utcMidnightOfDubaiDate(new Date("2026-10-27T20:00:00Z")).toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("21:00Z is 01:00 Dubai of the NEXT calendar day", () => {
    expect(dubaiDateString(utcMidnightOfDubaiDate(new Date("2026-10-27T21:00:00Z")))).toBe("2026-10-28");
  });
});
