import "server-only";
import { exponent } from "@/lib/currency";
import { buildExpenseAmounts, splitErrorMessage, type SplitInput } from "@/lib/splits";
import { AppError, invalid, notFound } from "@/server/errors";
import { summaries, type ExpenseSnapshot } from "@/server/activity";
import {
  assertMembersBelong,
  loadExpense,
  loadExpensePage,
  loadMembers,
  requireGroup,
  type ExpenseRow,
  type GroupRow,
  type MemberRow,
} from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { resolveRate } from "@/server/rates";
import { expenseInputSchema, idSchema, parseInput, type ExpenseInput } from "@/server/schemas";

const MAX_MAJOR = 10_000_000;

function splitMemberIds(split: SplitInput): string[] {
  switch (split.type) {
    case "equal":
      return [...split.participants];
    case "exact":
      return Object.keys(split.amounts);
    case "percent":
      return Object.keys(split.basisPoints);
    case "shares":
      return Object.keys(split.shares);
    case "itemized":
      return Object.keys(split.owed);
  }
}

export function snapshotOf(e: Pick<ExpenseRow, "description" | "amountMinor" | "currency" | "expenseDate" | "category" | "notes" | "splitType" | "payers" | "splits">): ExpenseSnapshot {
  return {
    description: e.description,
    amountMinor: e.amountMinor,
    currency: e.currency,
    expenseDate: e.expenseDate,
    category: e.category,
    notes: e.notes,
    splitType: e.splitType,
    payers: e.payers.map((p) => ({ memberId: p.memberId, amountMinor: p.amountMinor })),
    splits: e.splits.map((s) => ({ memberId: s.memberId, owedMinor: s.owedMinor })),
  };
}

/** Validates input and computes every stored amount (R8–R10, R13, R15–R18). */
async function prepareExpense(group: GroupRow, members: MemberRow[], input: ExpenseInput, existing?: ExpenseRow) {
  const data = parseInput(expenseInputSchema, input);
  if (data.amountMinor > MAX_MAJOR * 10 ** exponent(data.currency)) throw invalid("Amount is too large");
  assertMembersBelong(members, [...Object.keys(data.payers), ...splitMemberIds(data.split)]);

  const keepRate =
    existing && existing.currency === data.currency && existing.expenseDate === data.expenseDate && !data.manualRate;
  const rate = keepRate
    ? { rate: existing.fxRate, rateDate: existing.fxRateDate, source: existing.fxSource }
    : await resolveRate({ date: data.expenseDate, currency: data.currency, baseCurrency: group.baseCurrency, manual: data.manualRate });

  const built = buildExpenseAmounts({
    amountMinor: data.amountMinor,
    currency: data.currency,
    baseCurrency: group.baseCurrency,
    rate: rate.rate,
    payers: data.payers,
    split: data.split,
    memberOrder: members.map((m) => m.id),
  });
  if (!built.ok) throw invalid(splitErrorMessage(built.error, data.currency), built.error);
  const a = built.value;

  const expense = {
    description: data.description,
    category: data.category,
    notes: data.notes ?? null,
    expense_date: data.expenseDate,
    currency: data.currency,
    amount_minor: a.amountMinor,
    fx_rate: rate.rate,
    fx_rate_date: rate.rateDate,
    fx_source: rate.source,
    base_amount_minor: a.baseAmountMinor,
    split_type: data.split.type,
  };
  const payers = a.payers.map((p) => ({ member_id: p.memberId, amount_minor: p.amountMinor, base_amount_minor: p.baseAmountMinor }));
  const splits = a.splits.map((s) => ({
    member_id: s.memberId,
    input_value: s.inputValue,
    owed_minor: s.owedMinor,
    owed_base_minor: s.owedBaseMinor,
  }));
  const snapshot: ExpenseSnapshot = {
    description: data.description,
    amountMinor: a.amountMinor,
    currency: data.currency,
    expenseDate: data.expenseDate,
    category: data.category,
    notes: data.notes ?? null,
    splitType: data.split.type,
    payers: a.payers.map((p) => ({ memberId: p.memberId, amountMinor: p.amountMinor })),
    splits: a.splits.map((s) => ({ memberId: s.memberId, owedMinor: s.owedMinor })),
  };
  return { expense, payers, splits, snapshot };
}

export async function createExpense(token: unknown, input: ExpenseInput, actor?: unknown): Promise<{ id: string }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const actorMemberId = actorId(members, actor);
  const p = await prepareExpense(group, members, input);
  const id = await rpc<string>("create_expense", {
    p_group_id: group.id,
    p_expense: { ...p.expense, created_by_member_id: actorMemberId },
    p_payers: p.payers,
    p_splits: p.splits,
    p_activity: { actor_member_id: actorMemberId, action: "expense.created", summary: summaries.expenseCreated(p.snapshot) },
  });
  return { id };
}

/** R11: last write wins; logs every changed field as old → new. */
export async function updateExpense(token: unknown, expenseId: unknown, input: ExpenseInput, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, expenseId);
  const actorMemberId = actorId(members, actor);
  const existing = await loadExpense(group.id, id, members);
  if (existing.deletedAt) throw notFound();
  if (existing.splitType === "itemized") {
    throw new AppError("VALIDATION", 400, "Itemized expenses are edited from their receipt");
  }
  const p = await prepareExpense(group, members, input, existing);
  const names = new Map(members.map((m) => [m.id, m.name]));
  await rpc("update_expense", {
    p_group_id: group.id,
    p_expense_id: id,
    p_expense: p.expense,
    p_payers: p.payers,
    p_splits: p.splits,
    p_activity: {
      actor_member_id: actorMemberId,
      action: "expense.updated",
      summary: summaries.expenseUpdated(snapshotOf(existing), p.snapshot, names),
      details: { before: snapshotOf(existing), after: p.snapshot },
    },
  });
}

async function setDeleted(token: unknown, expenseId: unknown, deleted: boolean, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, expenseId);
  const actorMemberId = actorId(members, actor);
  const existing = await loadExpense(group.id, id, members);
  const snap = snapshotOf(existing);
  await rpc("set_expense_deleted", {
    p_group_id: group.id,
    p_expense_id: id,
    p_deleted: deleted,
    p_activity: {
      actor_member_id: actorMemberId,
      action: deleted ? "expense.deleted" : "expense.restored",
      summary: deleted ? summaries.expenseDeleted(snap) : summaries.expenseRestored(snap),
    },
  });
}

/** R11: soft delete (excluded from balances, suggestions, search, charts and CSV). */
export const deleteExpense = (token: unknown, expenseId: unknown, actor?: unknown) => setDeleted(token, expenseId, true, actor);
/** R12 (Should): restore a soft-deleted expense. */
export const restoreExpense = (token: unknown, expenseId: unknown, actor?: unknown) => setDeleted(token, expenseId, false, actor);

export async function getExpense(token: unknown, expenseId: unknown): Promise<ExpenseRow> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  return loadExpense(group.id, parseInput(idSchema, expenseId), members);
}

/** R8: expenses 50 at a time, newest expense_date first. */
export async function listExpenses(token: unknown, offset = 0): Promise<{ items: ExpenseRow[]; hasMore: boolean }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  return loadExpensePage(group.id, members, Math.max(0, Math.floor(offset)));
}
