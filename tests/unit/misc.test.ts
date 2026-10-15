import { describe, expect, it } from "vitest";
import { buildUpiLink, isValidUpiId, upiNote } from "@/lib/upi";
import { buildCsv, csvFilename, CSV_BASE_COLUMNS } from "@/lib/csv";
import { occurrenceAt, occurrencesDue, type RecurringRule } from "@/lib/recurring";
import { buildDemoSeed, DEMO_KEYS, DEMO_TARGET_BALANCES } from "@/lib/demo-seed";
import { computeBalances } from "@/lib/splits";
import { naiveCount, settle } from "@/lib/simplify";
import { generateToken, isValidToken } from "@/server/token";

describe("UPI (R6, R24)", () => {
  it("AC-13: builds the exact deep link", () => {
    expect(buildUpiLink({ pa: "priya@okicici", pn: "Priya S", amountMinor: 45050, groupName: "Goa Trip" })).toBe(
      "upi://pay?pa=priya@okicici&pn=Priya%20S&am=450.50&cu=INR&tn=Quits%3A%20Goa%20Trip",
    );
  });
  it("AC-13: validates UPI IDs", () => {
    expect(isValidUpiId("rohan.k@oksbi")).toBe(true);
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    for (const bad of ["rohan", "@ybl", "a b@ok", "x@1"]) expect(isValidUpiId(bad)).toBe(false);
  });
  it("truncates the note to 50 characters", () => {
    expect(upiNote("x".repeat(80))).toHaveLength(50);
  });
});

describe("CSV export (R43)", () => {
  const members = [
    { id: "a", name: "Aarav" },
    { id: "p", name: "Priya" },
  ];
  const base = {
    date: "2026-10-01",
    category: "Other",
    notes: null,
    currency: "INR",
    fxRate: "1",
    payers: [{ memberId: "a", amountMinor: 10000 }],
    owedBase: { a: 5000, p: 5000 },
    amountMinor: 10000,
    baseAmountMinor: 10000,
  };
  const csv = buildCsv({
    members,
    baseCurrency: "INR",
    expenses: [
      { ...base, description: "=SUM(A1)" },
      { ...base, date: "2026-10-02", description: 'Pizza, "large"' },
      { ...base, date: "2026-10-03", description: "Deleted one", deleted: true },
    ],
    settlements: [{ date: "2026-10-04", fromMemberId: "p", toMemberId: "a", amountMinor: 5000, note: null }],
  });
  const lines = csv.slice(1).split("\r\n");

  it("AC-32: starts with a BOM and the specified header", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe([...CSV_BASE_COLUMNS, "owes:Aarav", "owes:Priya"].join(","));
  });
  it("AC-32: guards formulas and quotes per RFC 4180", () => {
    expect(lines[1]).toContain(",'=SUM(A1),");
    expect(lines[2]).toContain(',"Pizza, ""large""",');
  });
  it("AC-32: leaves out deleted rows and includes settlements", () => {
    expect(csv).not.toContain("Deleted one");
    expect(lines[3]).toBe("settlement,2026-10-04,Priya paid Aarav,,,INR,50.00,1,INR,50.00,Priya,,");
    expect(lines[1]).toBe("expense,2026-10-01,'=SUM(A1),Other,,INR,100.00,1,INR,100.00,Aarav,50.00,50.00");
  });
  it("names the file quits-{slug}-{date}.csv", () => {
    expect(csvFilename("Flat 302 · HSR Layout", "2026-10-16")).toBe("quits-flat-302-hsr-layout-2026-10-16.csv");
  });
});

describe("recurring (R45)", () => {
  it("AC-34: monthly anchored on 2026-01-31 → 01-31, 02-28, 03-31, 04-30", () => {
    const rule = { frequency: "monthly" as const, anchorDate: "2026-01-31" };
    expect([0, 1, 2, 3].map((k) => occurrenceAt(rule, k))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrenceAt({ frequency: "monthly", anchorDate: "2027-12-31" }, 2)).toBe("2028-02-29");
    expect(occurrenceAt({ frequency: "weekly", anchorDate: "2026-10-01" }, 2)).toBe("2026-10-15");
  });
  it("AC-34: a second call returns nothing new once the first results are created", () => {
    const rule: RecurringRule = { frequency: "monthly", anchorDate: "2026-08-16", nextDue: "2026-08-16", endDate: null, active: true };
    const first = occurrencesDue(rule, "2026-10-16");
    expect(first).toEqual({ dates: ["2026-08-16", "2026-09-16", "2026-10-16"], nextDue: "2026-11-16" });
    expect(occurrencesDue({ ...rule, nextDue: first.nextDue }, "2026-10-16").dates).toEqual([]);
    expect(occurrencesDue(rule, "2026-10-16", new Set(first.dates)).dates).toEqual([]);
  });
  it("respects end dates, pauses and the catch-up cap", () => {
    const rule: RecurringRule = { frequency: "weekly", anchorDate: "2026-01-01", nextDue: "2026-01-01", endDate: "2026-01-20", active: true };
    expect(occurrencesDue(rule, "2026-10-16").dates).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
    expect(occurrencesDue({ ...rule, active: false }, "2026-10-16").dates).toEqual([]);
    const capped = occurrencesDue({ ...rule, endDate: null }, "2026-10-16");
    expect(capped.dates).toHaveLength(24);
    expect(capped.nextDue).toBe(occurrenceAt(rule, 24));
  });
});

describe("demo seed (R48)", () => {
  const seed = buildDemoSeed("2026-10-16");
  const expenses = seed.expenses.map((e) => ({ payers: e.amounts.payers, splits: e.amounts.splits }));
  const settlements = seed.settlements.map((s) => ({ fromMemberId: s.from, toMemberId: s.to, amountMinor: s.amountMinor }));

  it("AC-36: balances equal the targets; greedy 4, optimal 3", () => {
    const b = computeBalances(DEMO_KEYS, expenses, settlements);
    expect(b).toEqual(DEMO_TARGET_BALANCES);
    expect(b).toEqual({ aarav: 400000, priya: 300000, rohan: 300000, sneha: -600000, kabir: -400000 });
    const plan = settle(DEMO_KEYS.map((k) => ({ memberId: k, balance: b[k] })));
    expect(plan.greedyCount).toBe(4);
    expect(plan.optimalCount).toBe(3);
    expect(naiveCount(DEMO_KEYS, expenses, settlements)).toBeGreaterThan(3);
  });
  it("contains the content R48 requires", () => {
    const types = seed.expenses.map((e) => e.splitType);
    expect(seed.expenses.length).toBeGreaterThanOrEqual(15);
    expect(seed.expenses.filter((e) => /swiggy/i.test(e.description)).length).toBeGreaterThanOrEqual(3);
    expect(types).toEqual(expect.arrayContaining(["shares", "exact", "percent", "itemized", "equal"]));
    expect(seed.expenses.some((e) => e.amounts.payers.length > 1)).toBe(true);
    expect(seed.expenses.some((e) => e.currency === "USD" && e.fxRate !== "1")).toBe(true);
    expect(seed.expenses.find((e) => e.splitType === "itemized")?.receipt?.data.items.length).toBeGreaterThan(3);
    expect(seed.settlements).toHaveLength(1);
    expect(seed.members.every((m) => m.upiId.endsWith("@demo"))).toBe(true);
    const dates = seed.expenses.map((e) => e.date);
    expect(dates.every((d) => d >= "2026-09-04" && d <= "2026-10-16")).toBe(true);
  });
});

describe("share tokens (R1)", () => {
  it("AC-26: 10,000 tokens are unique, ≥ 22 chars, base64url", () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(22);
      set.add(t);
    }
    expect(set.size).toBe(10_000);
  });
  it("validates token format", () => {
    expect(isValidToken(generateToken())).toBe(true);
    expect(isValidToken("doesnotexist")).toBe(false);
    expect(isValidToken("../../etc/passwd")).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });
});
