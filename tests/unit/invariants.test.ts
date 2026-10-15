import { describe, expect, it } from "vitest";
import { rng } from "./helpers";
import { buildExpenseAmounts, computeBalances, expenseInvariantErrors, type ExpenseAmounts, type SplitInput } from "@/lib/splits";
import { allocateItemized } from "@/lib/receipt";
import { sum } from "@/lib/money";

const CURRENCIES = [
  { code: "INR", rates: ["1"] },
  { code: "USD", rates: ["83.4567", "95.98", "96.19"] },
  { code: "THB", rates: ["2.35", "2.8554"] },
  { code: "JPY", rates: ["0.5612", "0.6"] },
  { code: "EUR", rates: ["104.1234567891"] },
];

describe("AC-5: invariants hold for 1,000 random groups (R13, R14)", () => {
  it("per-expense sums are exact in both currencies and Σ balances = 0", () => {
    const r = rng(20261016);
    let expensesChecked = 0;
    for (let g = 0; g < 1000; g++) {
      const n = r.int(2, 12);
      const members = Array.from({ length: n }, (_, i) => `m${i}`);
      const expenses: ExpenseAmounts[] = [];
      const count = r.int(1, 40);
      for (let k = 0; k < count; k++) {
        const cur = r.pick(CURRENCIES);
        const rate = r.pick(cur.rates);
        let amountMinor = r.int(1, 2_000_000);
        const participants = r.subset(members);
        const payerIds = r.subset(members);
        let split: SplitInput;
        switch (r.int(0, 4)) {
          case 0:
            split = { type: "equal", participants };
            break;
          case 1: {
            const parts = r.partition(amountMinor, participants.length);
            split = { type: "exact", amounts: Object.fromEntries(participants.map((id, i) => [id, parts[i]])) };
            break;
          }
          case 2: {
            const bps = r.partition(10000, participants.length);
            split = { type: "percent", basisPoints: Object.fromEntries(participants.map((id, i) => [id, bps[i]])) };
            break;
          }
          case 3: {
            const sh = participants.map(() => r.int(0, 5));
            if (!sh.some((v) => v > 0)) sh[0] = 1;
            split = { type: "shares", shares: Object.fromEntries(participants.map((id, i) => [id, sh[i]])) };
            break;
          }
          default: {
            const items = Array.from({ length: r.int(1, 6) }, () => ({
              amountMinor: r.int(1, 50_000),
              assignees: r.subset(participants),
            }));
            const itemsSum = sum(items.map((i) => i.amountMinor));
            amountMinor = Math.max(1, itemsSum + r.int(-Math.floor(itemsSum / 2), Math.floor(itemsSum / 4)));
            const res = allocateItemized(items, amountMinor, members);
            if (!res.ok) throw new Error("itemized failed");
            split = { type: "itemized", owed: res.owed };
          }
        }
        const payerAmounts = r.partition(amountMinor, payerIds.length);
        const payers = Object.fromEntries(payerIds.map((id, i) => [id, payerAmounts[i]]));
        const built = buildExpenseAmounts({ amountMinor, currency: cur.code, baseCurrency: "INR", rate, payers, split, memberOrder: members });
        if (!built.ok) throw new Error(JSON.stringify(built.error));
        expect(expenseInvariantErrors(built.value)).toEqual([]);
        expenses.push(built.value);
        expensesChecked++;
      }
      const settlements = Array.from({ length: r.int(0, 5) }, () => {
        const from = r.pick(members);
        const to = members[(members.indexOf(from) + r.int(1, n - 1)) % n];
        return { fromMemberId: from, toMemberId: to, amountMinor: r.int(1, 500_000), deleted: r.next() < 0.2 };
      });
      const balances = computeBalances(
        members,
        expenses.map((e) => ({ ...e, deleted: r.next() < 0.1 })),
        settlements,
      );
      expect(sum(Object.values(balances))).toBe(0);
    }
    expect(expensesChecked).toBeGreaterThan(10000);
  });
});
