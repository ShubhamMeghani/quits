// Debt simplification (R19–R22): greedy, exact minimum (bitmask DP) and the naive count.
import { allocate, type Minor } from "./money";
import type { BalanceExpense, BalanceSettlement, MemberId } from "./splits";

export type Payment = { from: MemberId; to: MemberId; amountMinor: Minor };

export type MemberBalance = { memberId: MemberId; balance: Minor };

/** Above this many nonzero balances the exact DP is skipped (2^18 states). */
export const MAX_EXACT = 18;

/**
 * R20 greedy. `balances` must be in member order (the tie-break order).
 * Repeatedly the most negative debtor pays the most positive creditor min(|debt|, credit).
 */
export function greedy(balances: readonly MemberBalance[]): Payment[] {
  const b = balances.map((x) => ({ ...x }));
  const total = b.reduce((a, x) => a + x.balance, 0);
  if (total !== 0) throw new Error("greedy: balances do not sum to zero");
  const payments: Payment[] = [];
  for (;;) {
    let debtor = -1;
    let creditor = -1;
    for (let i = 0; i < b.length; i++) {
      if (b[i].balance < 0 && (debtor < 0 || b[i].balance < b[debtor].balance)) debtor = i;
      if (b[i].balance > 0 && (creditor < 0 || b[i].balance > b[creditor].balance)) creditor = i;
    }
    if (debtor < 0 || creditor < 0) break;
    const x = Math.min(-b[debtor].balance, b[creditor].balance);
    payments.push({ from: b[debtor].memberId, to: b[creditor].memberId, amountMinor: x });
    b[debtor].balance += x;
    b[creditor].balance -= x;
  }
  return payments;
}

/**
 * R19 exact minimum: n − k, where k is the maximum number of disjoint zero-sum subsets.
 * Returns the zero-sum groups (each as indices into `values`), ordered by earliest member.
 */
export function maxZeroSumPartition(values: readonly Minor[]): number[][] {
  const n = values.length;
  if (n > MAX_EXACT) throw new Error(`maxZeroSumPartition: n > ${MAX_EXACT}`);
  if (n === 0) return [];
  const size = 1 << n;
  const sums = new Float64Array(size);
  const dp = new Int32Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sums[mask] = sums[mask ^ low] + values[i];
    let best = -1;
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) {
        const v = dp[mask ^ (1 << j)];
        if (v > best) best = v;
      }
    }
    dp[mask] = best + (sums[mask] === 0 ? 1 : 0);
  }

  // Deterministic recovery: from the full mask, remove the lowest index that keeps dp optimal.
  // Consecutive zero-sum masks along the path delimit the groups.
  const groups: number[][] = [];
  let mask = size - 1;
  let current: number[] = [];
  while (mask) {
    const z = sums[mask] === 0 ? 1 : 0;
    let chosen = -1;
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j) && dp[mask ^ (1 << j)] + z === dp[mask]) {
        chosen = j;
        break;
      }
    }
    if (z === 1 && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(chosen);
    mask ^= 1 << chosen;
  }
  if (current.length) groups.push(current);
  return groups.map((g) => g.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}

export type SettlePlan = {
  algorithm: "optimal" | "greedy";
  payments: Payment[];
  greedyCount: number;
  optimalCount: number | null;
  nonzero: number;
};

/** R19/R22: the suggested payments plus the greedy and optimal counts. */
export function settle(balances: readonly MemberBalance[]): SettlePlan {
  const nz = balances.filter((b) => b.balance !== 0);
  const g = greedy(nz);
  if (nz.length > MAX_EXACT) {
    return { algorithm: "greedy", payments: g, greedyCount: g.length, optimalCount: null, nonzero: nz.length };
  }
  const groups = maxZeroSumPartition(nz.map((b) => b.balance));
  const payments = groups.flatMap((group) => greedy(group.map((i) => nz[i])));
  return {
    algorithm: "optimal",
    payments,
    greedyCount: g.length,
    optimalCount: nz.length - groups.length,
    nonzero: nz.length,
  };
}

/**
 * R21 naive count: for each expense, each participant owes each payer owed × paid_j / total
 * (allocated with R13); settlements reduce the pair; count pairs with a nonzero net amount.
 */
export function naiveCount(
  memberOrder: readonly MemberId[],
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[],
): number {
  const index = new Map(memberOrder.map((id, i) => [id, i]));
  const net = new Map<string, number>(); // key "a|b" with a < b in member order; positive = a owes b
  const owe = (debtor: MemberId, creditor: MemberId, amount: Minor) => {
    if (debtor === creditor || amount === 0) return;
    const a = index.get(debtor)!;
    const b = index.get(creditor)!;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    net.set(key, (net.get(key) ?? 0) + (a < b ? amount : -amount));
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    const payers = [...e.payers]
      .filter((p) => p.baseAmountMinor > 0)
      .sort((x, y) => index.get(x.memberId)! - index.get(y.memberId)!);
    if (payers.length === 0) continue;
    for (const s of e.splits) {
      if (s.owedBaseMinor === 0) continue;
      const parts = allocate(s.owedBaseMinor, payers.map((p) => p.baseAmountMinor));
      payers.forEach((p, j) => owe(s.memberId, p.memberId, parts[j]));
    }
  }
  for (const s of settlements) {
    if (s.deleted) continue;
    // A settlement from → to reduces what `from` owes `to`.
    owe(s.toMemberId, s.fromMemberId, s.amountMinor);
  }
  let count = 0;
  for (const v of net.values()) if (v !== 0) count++;
  return count;
}

/** Applies payments to balances (used by tests and the UI to verify a plan zeroes everything). */
export function applyPayments(balances: readonly MemberBalance[], payments: readonly Payment[]): MemberBalance[] {
  const b = new Map(balances.map((x) => [x.memberId, x.balance]));
  for (const p of payments) {
    b.set(p.from, (b.get(p.from) ?? 0) + p.amountMinor);
    b.set(p.to, (b.get(p.to) ?? 0) - p.amountMinor);
  }
  return balances.map((x) => ({ memberId: x.memberId, balance: b.get(x.memberId)! }));
}
