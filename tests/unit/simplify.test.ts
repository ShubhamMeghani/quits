import { describe, expect, it } from "vitest";
import { rng } from "./helpers";
import { applyPayments, greedy, maxZeroSumPartition, naiveCount, paymentHeadline, settle, type MemberBalance } from "@/lib/simplify";
import { buildExpenseAmounts } from "@/lib/splits";

const R = 100; // paise per rupee
const bal = (pairs: [string, number][]): MemberBalance[] => pairs.map(([memberId, rupees]) => ({ memberId, balance: rupees * R }));
const pay = (from: string, to: string, rupees: number) => ({ from, to, amountMinor: rupees * R });

describe("greedy vs optimal (R19, R20)", () => {
  const AC9 = bal([
    ["A", 400],
    ["B", 300],
    ["C", 300],
    ["D", -600],
    ["E", -400],
  ]);

  it("AC-9: greedy returns exactly [D→A 400, E→B 300, D→C 200, E→C 100]", () => {
    expect(greedy(AC9)).toEqual([pay("D", "A", 400), pay("E", "B", 300), pay("D", "C", 200), pay("E", "C", 100)]);
  });
  it("AC-9: optimal returns exactly [E→A 400, D→B 300, D→C 300]", () => {
    const plan = settle(AC9);
    expect(plan.algorithm).toBe("optimal");
    expect(plan.payments).toEqual([pay("E", "A", 400), pay("D", "B", 300), pay("D", "C", 300)]);
    expect(plan.greedyCount).toBe(4);
    expect(plan.optimalCount).toBe(3);
    expect(maxZeroSumPartition(AC9.map((b) => b.balance))).toEqual([
      [0, 4],
      [1, 2, 3],
    ]);
  });
  it("AC-9: applying either list zeroes every balance", () => {
    for (const p of [greedy(AC9), settle(AC9).payments]) {
      expect(applyPayments(AC9, p).every((b) => b.balance === 0)).toBe(true);
    }
  });
});

describe("naive count (R21)", () => {
  it("AC-10: A pays ₹300 and B ₹600, each split equally among A, B, C → naive 3, greedy 1, optimal 1", () => {
    const order = ["A", "B", "C"];
    const mk = (payer: string, amount: number) => {
      const r = buildExpenseAmounts({
        amountMinor: amount,
        currency: "INR",
        baseCurrency: "INR",
        rate: "1",
        payers: { [payer]: amount },
        split: { type: "equal", participants: order },
        memberOrder: order,
      });
      if (!r.ok) throw new Error("bad expense");
      return r.value;
    };
    const expenses = [mk("A", 30000), mk("B", 60000)];
    expect(naiveCount(order, expenses, [])).toBe(3);
    const plan = settle(bal([["A", 0], ["B", 300], ["C", -300]]));
    expect(plan.greedyCount).toBe(1);
    expect(plan.optimalCount).toBe(1);
    expect(plan.payments).toEqual([pay("C", "B", 300)]);
  });
  it("settlements reduce the pair between their two members", () => {
    const order = ["A", "B"];
    const r = buildExpenseAmounts({
      amountMinor: 10000,
      currency: "INR",
      baseCurrency: "INR",
      rate: "1",
      payers: { A: 10000 },
      split: { type: "equal", participants: order },
      memberOrder: order,
    });
    if (!r.ok) throw new Error("bad expense");
    expect(naiveCount(order, [r.value], [])).toBe(1);
    expect(naiveCount(order, [r.value], [{ fromMemberId: "B", toMemberId: "A", amountMinor: 5000 }])).toBe(0);
  });
});

/** Brute force: max number of zero-sum blocks over all set partitions where every block sums to 0. */
function bruteOptimal(values: number[]): number {
  const n = values.length;
  let best = 0;
  const blocks: number[] = [];
  const rec = (i: number) => {
    if (i === n) {
      if (blocks.every((s) => s === 0)) best = Math.max(best, blocks.length);
      return;
    }
    for (let b = 0; b < blocks.length; b++) {
      blocks[b] += values[i];
      rec(i + 1);
      blocks[b] -= values[i];
    }
    blocks.push(values[i]);
    rec(i + 1);
    blocks.pop();
  };
  rec(0);
  return n - best;
}

function randomBalances(r: ReturnType<typeof rng>, n: number, spread: number): MemberBalance[] {
  for (;;) {
    const vals = Array.from({ length: n - 1 }, () => {
      let v = 0;
      while (v === 0) v = r.int(-spread, spread);
      return v * R;
    });
    const last = -vals.reduce((a, b) => a + b, 0);
    if (last === 0) continue;
    return [...vals, last].map((balance, i) => ({ memberId: `m${i}`, balance }));
  }
}

describe("exact algorithm (R19)", () => {
  it("AC-11: all-zero → 0 payments; {+x, −x} → 1 payment", () => {
    expect(settle(bal([["A", 0], ["B", 0]])).payments).toEqual([]);
    expect(settle([]).payments).toEqual([]);
    const plan = settle(bal([["A", 50], ["B", -50]]));
    expect(plan.payments).toEqual([pay("B", "A", 50)]);
    expect(plan.optimalCount).toBe(1);
  });
  it("AC-11: 300 random cases with n ≤ 8 match brute force and never exceed greedy", () => {
    const r = rng(42);
    for (let t = 0; t < 300; t++) {
      const b = randomBalances(r, r.int(2, 8), 4);
      const plan = settle(b);
      const brute = bruteOptimal(b.map((x) => x.balance));
      expect(plan.optimalCount).toBe(brute);
      expect(plan.payments).toHaveLength(brute);
      expect(plan.optimalCount!).toBeLessThanOrEqual(plan.greedyCount);
      expect(applyPayments(b, plan.payments).every((x) => x.balance === 0)).toBe(true);
      expect(plan.payments.every((p) => p.amountMinor > 0)).toBe(true);
    }
  });
  it("AC-12: 18 random nonzero balances are solved exactly in < 2 s", () => {
    const b = randomBalances(rng(7), 18, 50);
    const t0 = performance.now();
    const plan = settle(b);
    const ms = performance.now() - t0;
    expect(plan.algorithm).toBe("optimal");
    expect(plan.nonzero).toBe(18);
    expect(ms).toBeLessThan(2000);
    expect(applyPayments(b, plan.payments).every((x) => x.balance === 0)).toBe(true);
  });
  it("AC-12: 19 nonzero balances → greedy with optimal = null", () => {
    const b = randomBalances(rng(8), 19, 50);
    const plan = settle(b);
    expect(plan.algorithm).toBe("greedy");
    expect(plan.optimalCount).toBeNull();
    expect(plan.payments).toEqual(greedy(b));
  });
  it("AC-12: two runs on the same input are deep-equal", () => {
    const b = randomBalances(rng(9), 12, 5);
    expect(settle(b)).toEqual(settle(b.map((x) => ({ ...x }))));
  });
});

describe("AC-57: the Settle headline in plain words (R22, SPEC v1.5)", () => {
  it("fewer payments than naive → '3 payments instead of 6' with the Simplified badge", () => {
    expect(paymentHeadline(3, 6)).toEqual({ text: "3 payments instead of 6", simplified: true });
    expect(paymentHeadline(1, 2)).toEqual({ text: "1 payment instead of 2", simplified: true });
  });
  it("as many as naive → just the count, no badge", () => {
    expect(paymentHeadline(2, 2)).toEqual({ text: "2 payments", simplified: false });
    expect(paymentHeadline(1, 1)).toEqual({ text: "1 payment", simplified: false });
  });
  it("nothing to pay → no headline (the settled-up state is shown instead)", () => {
    expect(paymentHeadline(0, 0)).toBeNull();
  });
  it("the demo balances give 3 payments; with the demo's naive count of 10 that reads '3 payments instead of 10'", () => {
    const b = (memberId: string, balance: number): MemberBalance => ({ memberId, balance });
    const balances = [b("aarav", 400000), b("priya", 300000), b("rohan", 300000), b("sneha", -600000), b("kabir", -400000)];
    const plan = settle(balances);
    expect(plan.payments).toHaveLength(3);
    expect(paymentHeadline(plan.payments.length, 10)?.text).toBe("3 payments instead of 10");
  });
});
