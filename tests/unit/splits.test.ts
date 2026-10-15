import { describe, expect, it } from "vitest";
import {
  buildExpenseAmounts,
  computeBalances,
  computePayers,
  computeSplit,
  percentToBasisPoints,
  type SplitInput,
} from "@/lib/splits";

const M = ["A", "B", "C", "D"];
const owed = (total: number, input: SplitInput, order = M) => {
  const r = computeSplit(total, input, order);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.map((s) => s.owedMinor);
};

const inr = (amountMinor: number, payers: Record<string, number>, split: SplitInput, order = M) => {
  const r = buildExpenseAmounts({ amountMinor, currency: "INR", baseCurrency: "INR", rate: "1", payers, split, memberOrder: order });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("split types (R9)", () => {
  it("AC-1: equal ₹100.00 among A, B, C → [3334, 3333, 3333]", () => {
    expect(owed(10000, { type: "equal", participants: ["A", "B", "C"] })).toEqual([3334, 3333, 3333]);
  });
  it("AC-1: equal 100 paise among 7 → [15, 15, 14, 14, 14, 14, 14]", () => {
    const seven = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
    expect(owed(100, { type: "equal", participants: seven }, seven)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });
  it("equal split follows member order, not input order", () => {
    expect(owed(10000, { type: "equal", participants: ["C", "A", "B"] })).toEqual([3334, 3333, 3333]);
    const r = computeSplit(10000, { type: "equal", participants: ["C", "A", "B"] }, M);
    expect(r.ok && r.value.map((s) => s.memberId)).toEqual(["A", "B", "C"]);
  });
  it("AC-2: 999 paise by percent [50, 25, 25] → [499, 250, 250]", () => {
    expect(owed(999, { type: "percent", basisPoints: { A: 5000, B: 2500, C: 2500 } })).toEqual([499, 250, 250]);
  });
  it("AC-2: 1001 paise by shares [2, 1, 1] → [501, 250, 250]", () => {
    expect(owed(1001, { type: "shares", shares: { A: 2, B: 1, C: 1 } })).toEqual([501, 250, 250]);
  });
  it("AC-3: exact amounts summing to 9999 for 10000 are rejected with difference 1", () => {
    const r = computeSplit(10000, { type: "exact", amounts: { A: 5000, B: 4999 } }, M);
    expect(r).toEqual({ ok: false, error: { code: "EXACT_MISMATCH", diff: 1 } });
  });
  it("AC-3: percentages summing to 99.99 are rejected", () => {
    const r = computeSplit(10000, { type: "percent", basisPoints: { A: 3333, B: 3333, C: 3333 } }, M);
    expect(r).toEqual({ ok: false, error: { code: "PERCENT_MISMATCH", diffBasisPoints: 1 } });
  });
  it("exact amounts that match are accepted (zero rows dropped)", () => {
    expect(owed(10000, { type: "exact", amounts: { A: 5000, B: 0, C: 5000 } })).toEqual([5000, 5000]);
  });
  it("rejects empty, unknown and invalid inputs", () => {
    expect(computeSplit(100, { type: "equal", participants: [] }, M)).toMatchObject({ ok: false, error: { code: "NO_PARTICIPANTS" } });
    expect(computeSplit(100, { type: "equal", participants: ["Z"] }, M)).toMatchObject({ ok: false, error: { code: "UNKNOWN_MEMBER" } });
    expect(computeSplit(100, { type: "shares", shares: { A: 0, B: 0 } }, M)).toMatchObject({ ok: false, error: { code: "SHARES_ZERO" } });
    expect(computeSplit(100, { type: "shares", shares: { A: 1.5 } }, M)).toMatchObject({ ok: false, error: { code: "INVALID_VALUE" } });
    expect(computeSplit(0, { type: "equal", participants: ["A"] }, M)).toMatchObject({ ok: false, error: { code: "INVALID_TOTAL" } });
  });
  it("parses percentages with up to 2 decimals", () => {
    expect(percentToBasisPoints("33.33")).toBe(3333);
    expect(percentToBasisPoints("12.5")).toBe(1250);
    expect(percentToBasisPoints("100")).toBe(10000);
    expect(percentToBasisPoints("100.01")).toBeNull();
    expect(percentToBasisPoints("1.234")).toBeNull();
  });
});

describe("payers (R8, R10)", () => {
  it("requires payer amounts to sum exactly to the total", () => {
    expect(computePayers(100000, { A: 60000, B: 39999 }, M)).toEqual({ ok: false, error: { code: "PAYERS_MISMATCH", diff: 1 } });
    expect(computePayers(100000, {}, M)).toMatchObject({ ok: false, error: { code: "NO_PAYER" } });
    expect(computePayers(100000, { A: 60000, B: 40000 }, M)).toMatchObject({ ok: true });
  });
});

describe("balances (R14)", () => {
  it("AC-4: A pays ₹300 split equally among A, B, C → A +200, B −100, C −100", () => {
    const e = inr(30000, { A: 30000 }, { type: "equal", participants: ["A", "B", "C"] });
    expect(computeBalances(M, [e], [])).toEqual({ A: 20000, B: -10000, C: -10000, D: 0 });
  });
  it("AC-4: A pays ₹600 and B ₹400 for ₹1,000 among 4 → A +350, B +150, C −250, D −250", () => {
    const e = inr(100000, { A: 60000, B: 40000 }, { type: "equal", participants: M });
    expect(computeBalances(M, [e], [])).toEqual({ A: 35000, B: 15000, C: -25000, D: -25000 });
  });
  it("AC-4: a soft-deleted expense contributes nothing", () => {
    const e = inr(30000, { A: 30000 }, { type: "equal", participants: ["A", "B", "C"] });
    expect(computeBalances(M, [{ ...e, deleted: true }], [])).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });
  it("settlements: sent increases, received decreases; deleted ones are ignored", () => {
    const e = inr(30000, { A: 30000 }, { type: "equal", participants: ["A", "B", "C"] });
    const s = [
      { fromMemberId: "B", toMemberId: "A", amountMinor: 10000 },
      { fromMemberId: "C", toMemberId: "A", amountMinor: 10000, deleted: true },
    ];
    expect(computeBalances(M, [e], s)).toEqual({ A: 10000, B: 0, C: -10000, D: 0 });
  });
});
