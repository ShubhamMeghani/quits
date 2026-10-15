// Splits, payers, expense amounts and balances (R9–R11, R13, R14, R17).
import { allocate, assertMinor, sum, type Minor } from "./money";
import { convertParts } from "./currency";

export type MemberId = string;

export type SplitInput =
  | { type: "equal"; participants: readonly MemberId[] }
  | { type: "exact"; amounts: Readonly<Record<MemberId, Minor>> }
  /** Percentages in basis points: 100.00% = 10000. */
  | { type: "percent"; basisPoints: Readonly<Record<MemberId, number>> }
  | { type: "shares"; shares: Readonly<Record<MemberId, number>> }
  /** Pre-computed owed amounts (from lib/receipt allocateItemized). */
  | { type: "itemized"; owed: Readonly<Record<MemberId, Minor>> };

export type SplitType = SplitInput["type"];

export type SplitError =
  | { code: "INVALID_TOTAL" }
  | { code: "NO_PARTICIPANTS" }
  | { code: "UNKNOWN_MEMBER"; memberId: MemberId }
  | { code: "INVALID_VALUE"; memberId: MemberId }
  /** diff = total − Σ entered amounts (positive = left to assign). */
  | { code: "EXACT_MISMATCH"; diff: Minor }
  /** diff in basis points = 10000 − Σ entered percentages. */
  | { code: "PERCENT_MISMATCH"; diffBasisPoints: number }
  | { code: "SHARES_ZERO" }
  | { code: "PAYERS_MISMATCH"; diff: Minor }
  | { code: "NO_PAYER" };

/**
 * `weight` is the exact (unrounded) proportion behind `owedMinor`: 1 for equal, basis points for
 * percent, shares for shares, and the amount itself for exact/itemized. R17 allocates the converted
 * base total by these weights, so an equal split stays equal in the base currency (AC-6).
 */
export type SplitShare = { memberId: MemberId; inputValue: number | null; owedMinor: Minor; weight: number };

type Result<T> = { ok: true; value: T } | { ok: false; error: SplitError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: SplitError): Result<T> => ({ ok: false, error });

/** Parses "33.33" (percent, ≤ 2 decimals) into basis points; null if invalid. */
export function percentToBasisPoints(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}

/**
 * Computes each member's owed amount for an expense total (R9). Members are visited in
 * `memberOrder`, which is also the tie-break order for the largest-remainder rule (R13).
 */
export function computeSplit(
  totalMinor: Minor,
  input: SplitInput,
  memberOrder: readonly MemberId[],
): Result<SplitShare[]> {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return fail({ code: "INVALID_TOTAL" });
  const known = new Set(memberOrder);
  const keys =
    input.type === "equal"
      ? input.participants
      : Object.keys(
          input.type === "exact"
            ? input.amounts
            : input.type === "percent"
              ? input.basisPoints
              : input.type === "shares"
                ? input.shares
                : input.owed,
        );
  for (const k of keys) if (!known.has(k)) return fail({ code: "UNKNOWN_MEMBER", memberId: k });

  switch (input.type) {
    case "equal": {
      const set = new Set(input.participants);
      const ids = memberOrder.filter((id) => set.has(id));
      if (ids.length === 0) return fail({ code: "NO_PARTICIPANTS" });
      const owed = allocate(totalMinor, ids.map(() => 1));
      return ok(ids.map((memberId, i) => ({ memberId, inputValue: null, owedMinor: owed[i], weight: 1 })));
    }
    case "exact": {
      const ids = memberOrder.filter((id) => id in input.amounts);
      for (const id of ids) {
        const v = input.amounts[id];
        if (!Number.isSafeInteger(v) || v < 0) return fail({ code: "INVALID_VALUE", memberId: id });
      }
      const ids2 = ids.filter((id) => input.amounts[id] > 0);
      if (ids2.length === 0) return fail({ code: "NO_PARTICIPANTS" });
      const diff = totalMinor - sum(ids.map((id) => input.amounts[id]));
      if (diff !== 0) return fail({ code: "EXACT_MISMATCH", diff });
      return ok(ids2.map((memberId) => ({ memberId, inputValue: input.amounts[memberId], owedMinor: input.amounts[memberId], weight: input.amounts[memberId] })));
    }
    case "percent": {
      const ids = memberOrder.filter((id) => id in input.basisPoints);
      for (const id of ids) {
        const v = input.basisPoints[id];
        if (!Number.isInteger(v) || v < 0 || v > 10000) return fail({ code: "INVALID_VALUE", memberId: id });
      }
      const total = ids.reduce((a, id) => a + input.basisPoints[id], 0);
      if (total !== 10000) return fail({ code: "PERCENT_MISMATCH", diffBasisPoints: 10000 - total });
      const used = ids.filter((id) => input.basisPoints[id] > 0);
      const owed = allocate(totalMinor, used.map((id) => input.basisPoints[id]));
      return ok(used.map((memberId, i) => ({ memberId, inputValue: input.basisPoints[memberId], owedMinor: owed[i], weight: input.basisPoints[memberId] })));
    }
    case "shares": {
      const ids = memberOrder.filter((id) => id in input.shares);
      for (const id of ids) {
        const v = input.shares[id];
        if (!Number.isSafeInteger(v) || v < 0) return fail({ code: "INVALID_VALUE", memberId: id });
      }
      const used = ids.filter((id) => input.shares[id] > 0);
      if (used.length === 0) return fail({ code: "SHARES_ZERO" });
      const owed = allocate(totalMinor, used.map((id) => input.shares[id]));
      return ok(used.map((memberId, i) => ({ memberId, inputValue: input.shares[memberId], owedMinor: owed[i], weight: input.shares[memberId] })));
    }
    case "itemized": {
      const ids = memberOrder.filter((id) => id in input.owed);
      for (const id of ids) {
        const v = input.owed[id];
        if (!Number.isSafeInteger(v)) return fail({ code: "INVALID_VALUE", memberId: id });
      }
      const used = ids.filter((id) => input.owed[id] !== 0);
      if (used.length === 0) return fail({ code: "NO_PARTICIPANTS" });
      const diff = totalMinor - sum(used.map((id) => input.owed[id]));
      if (diff !== 0) return fail({ code: "EXACT_MISMATCH", diff });
      return ok(used.map((memberId) => ({ memberId, inputValue: null, owedMinor: input.owed[memberId], weight: input.owed[memberId] })));
    }
  }
}

/** Validates payer amounts (R8, R10): non-negative, at least one payer, Σ = total exactly. */
export function computePayers(
  totalMinor: Minor,
  payers: Readonly<Record<MemberId, Minor>>,
  memberOrder: readonly MemberId[],
): Result<{ memberId: MemberId; amountMinor: Minor }[]> {
  const known = new Set(memberOrder);
  for (const k of Object.keys(payers)) if (!known.has(k)) return fail({ code: "UNKNOWN_MEMBER", memberId: k });
  const ids = memberOrder.filter((id) => id in payers);
  for (const id of ids) {
    const v = payers[id];
    if (!Number.isSafeInteger(v) || v < 0) return fail({ code: "INVALID_VALUE", memberId: id });
  }
  const used = ids.filter((id) => payers[id] > 0);
  if (used.length === 0) return fail({ code: "NO_PAYER" });
  const diff = totalMinor - sum(used.map((id) => payers[id]));
  if (diff !== 0) return fail({ code: "PAYERS_MISMATCH", diff });
  return ok(used.map((memberId) => ({ memberId, amountMinor: payers[memberId] })));
}

export type ExpensePayerRow = { memberId: MemberId; amountMinor: Minor; baseAmountMinor: Minor };
export type ExpenseSplitRow = { memberId: MemberId; inputValue: number | null; owedMinor: Minor; owedBaseMinor: Minor };

export type ExpenseAmounts = {
  amountMinor: Minor;
  baseAmountMinor: Minor;
  payers: ExpensePayerRow[];
  splits: ExpenseSplitRow[];
};

/**
 * Builds all stored amounts of an expense: payers and splits in the original currency, then
 * base-currency amounts via R17 (convert the total, allocate it by original amounts).
 */
export function buildExpenseAmounts(params: {
  amountMinor: Minor;
  currency: string;
  baseCurrency: string;
  rate: string;
  payers: Readonly<Record<MemberId, Minor>>;
  split: SplitInput;
  memberOrder: readonly MemberId[];
}): Result<ExpenseAmounts> {
  const { amountMinor, currency, baseCurrency, rate, memberOrder } = params;
  const split = computeSplit(amountMinor, params.split, memberOrder);
  if (!split.ok) return split;
  const payers = computePayers(amountMinor, params.payers, memberOrder);
  if (!payers.ok) return payers;

  const sharesBase = convertParts(amountMinor, split.value.map((s) => s.weight), currency, baseCurrency, rate);
  const payersBase = convertParts(amountMinor, payers.value.map((p) => p.amountMinor), currency, baseCurrency, rate);
  const result: ExpenseAmounts = {
    amountMinor,
    baseAmountMinor: sharesBase.baseTotal,
    payers: payers.value.map((p, i) => ({ ...p, baseAmountMinor: payersBase.baseParts[i] })),
    splits: split.value.map((s, i) => ({
      memberId: s.memberId,
      inputValue: s.inputValue,
      owedMinor: s.owedMinor,
      owedBaseMinor: sharesBase.baseParts[i],
    })),
  };
  assertExpenseInvariants(result);
  return ok(result);
}

/** R14: per expense, Σ payers = Σ splits = total, in both the original and base currency. */
export function expenseInvariantErrors(e: ExpenseAmounts): string[] {
  const errors: string[] = [];
  if (sum(e.payers.map((p) => p.amountMinor)) !== e.amountMinor) errors.push("payers != amount");
  if (sum(e.splits.map((s) => s.owedMinor)) !== e.amountMinor) errors.push("splits != amount");
  if (sum(e.payers.map((p) => p.baseAmountMinor)) !== e.baseAmountMinor) errors.push("payers != base amount");
  if (sum(e.splits.map((s) => s.owedBaseMinor)) !== e.baseAmountMinor) errors.push("splits != base amount");
  return errors;
}

export function assertExpenseInvariants(e: ExpenseAmounts): void {
  const errors = expenseInvariantErrors(e);
  if (errors.length) throw new Error(`expense invariant violated: ${errors.join(", ")}`);
}

// ---------- Balances (R14) ----------

export type BalanceExpense = {
  payers: readonly { memberId: MemberId; baseAmountMinor: Minor }[];
  splits: readonly { memberId: MemberId; owedBaseMinor: Minor }[];
  deleted?: boolean;
};

export type BalanceSettlement = {
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amountMinor: Minor;
  deleted?: boolean;
};

/** balance = Σ paid_base − Σ owed_base + Σ settlements sent − Σ settlements received. */
export function computeBalances(
  memberOrder: readonly MemberId[],
  expenses: readonly BalanceExpense[],
  settlements: readonly BalanceSettlement[],
): Record<MemberId, Minor> {
  const bal: Record<MemberId, Minor> = Object.fromEntries(memberOrder.map((id) => [id, 0]));
  const add = (id: MemberId, v: Minor) => {
    if (!(id in bal)) throw new Error(`unknown member in balances: ${id}`);
    bal[id] += v;
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    for (const p of e.payers) add(p.memberId, p.baseAmountMinor);
    for (const s of e.splits) add(s.memberId, -s.owedBaseMinor);
  }
  for (const s of settlements) {
    if (s.deleted) continue;
    add(s.fromMemberId, s.amountMinor);
    add(s.toMemberId, -s.amountMinor);
  }
  for (const id of memberOrder) assertMinor(bal[id], "balance");
  return bal;
}

export function balancesSumToZero(balances: Readonly<Record<MemberId, Minor>>): boolean {
  return sum(Object.values(balances)) === 0;
}
