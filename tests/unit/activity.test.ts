import { describe, expect, it } from "vitest";
import { expenseChanges, summaries, type ExpenseSnapshot } from "@/server/activity";

const names = new Map([
  ["a", "Aarav"],
  ["p", "Priya"],
]);

const base: ExpenseSnapshot = {
  description: "Snacks",
  amountMinor: 50000,
  currency: "INR",
  expenseDate: "2026-10-08",
  category: "Food & Drinks",
  notes: null,
  splitType: "equal",
  payers: [{ memberId: "a", amountMinor: 50000 }],
  splits: [
    { memberId: "a", owedMinor: 25000 },
    { memberId: "p", owedMinor: 25000 },
  ],
};

describe("activity summaries (R42)", () => {
  it("AC-29: an amount edit reads 'Amount ₹500.00 → ₹600.00'", () => {
    const after = { ...base, amountMinor: 60000, payers: [{ memberId: "a", amountMinor: 60000 }], splits: base.splits.map((s) => ({ ...s, owedMinor: 30000 })) };
    const changes = expenseChanges(base, after, names);
    expect(changes[0]).toBe("Amount ₹500.00 → ₹600.00");
    expect(summaries.expenseUpdated(base, after, names)).toContain("Amount ₹500.00 → ₹600.00");
  });
  it("lists every changed field as old → new", () => {
    const after: ExpenseSnapshot = {
      ...base,
      description: "Chips",
      expenseDate: "2026-10-09",
      category: "Groceries",
      notes: "late night",
      payers: [{ memberId: "p", amountMinor: 50000 }],
      splitType: "shares",
    };
    expect(expenseChanges(base, after, names)).toEqual([
      'Description "Snacks" → "Chips"',
      "Date 2026-10-08 → 2026-10-09",
      "Category Food & Drinks → Groceries",
      'Notes "" → "late night"',
      "Paid by Aarav → Priya",
      "Split equal → shares",
    ]);
  });
  it("summarizes settlements and members", () => {
    expect(summaries.settlementCreated("Kabir", "Aarav", 150000, "INR", "upi")).toBe("Recorded payment: Kabir paid Aarav ₹1,500.00 via UPI");
    expect(summaries.memberUpdated({ name: "Priya", upiId: null }, { name: "Priya S", upiId: "priya@ok" })).toBe(
      "Updated Priya S: Name Priya → Priya S; UPI ID none → priya@ok",
    );
  });
});
