import "server-only";
import { db } from "@/server/db";
import { fromDbError, notFound } from "@/server/errors";
import { isValidToken } from "@/server/token";
import type { DefaultSplit } from "@/server/schemas";

export type GroupRow = {
  id: string;
  shareToken: string;
  name: string;
  baseCurrency: string;
  defaultSplit: DefaultSplit | null;
  isDemo: boolean;
  createdAt: string;
};

export type MemberRow = {
  id: string;
  name: string;
  upiId: string | null;
  displayOrder: number;
  archived: boolean;
};

export type PayerRow = { memberId: string; amountMinor: number; baseAmountMinor: number };
export type SplitRow = { memberId: string; inputValue: number | null; owedMinor: number; owedBaseMinor: number };

export type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  notes: string | null;
  expenseDate: string;
  currency: string;
  amountMinor: number;
  fxRate: string;
  fxRateDate: string;
  fxSource: "identity" | "frankfurter" | "manual";
  baseAmountMinor: number;
  splitType: "equal" | "exact" | "percent" | "shares" | "itemized";
  receiptId: string | null;
  recurringRuleId: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payers: PayerRow[];
  splits: SplitRow[];
};

export type SettlementRow = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  settledOn: string;
  method: "upi" | "cash" | "other";
  note: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  deletedAt: string | null;
};

const GROUP_COLUMNS = "id, share_token, name, base_currency, default_split, is_demo, created_at";

type DbGroup = {
  id: string;
  share_token: string;
  name: string;
  base_currency: string;
  default_split: DefaultSplit | null;
  is_demo: boolean;
  created_at: string;
};

const toGroup = (g: DbGroup): GroupRow => ({
  id: g.id,
  shareToken: g.share_token,
  name: g.name,
  baseCurrency: g.base_currency,
  defaultSplit: g.default_split,
  isDemo: g.is_demo,
  createdAt: g.created_at,
});

/** Token → group, or null for malformed or unknown tokens (R1: same 404 either way). */
export async function findGroupByToken(token: unknown): Promise<GroupRow | null> {
  if (!isValidToken(token)) return null;
  const { data, error } = await db().from("groups").select(GROUP_COLUMNS).eq("share_token", token).maybeSingle<DbGroup>();
  if (error) throw fromDbError(error, "findGroupByToken");
  return data ? toGroup(data) : null;
}

export async function requireGroup(token: unknown): Promise<GroupRow> {
  const g = await findGroupByToken(token);
  if (!g) throw notFound();
  return g;
}

export async function loadMembers(groupId: string): Promise<MemberRow[]> {
  const { data, error } = await db()
    .from("members")
    .select("id, name, upi_id, display_order, archived_at")
    .eq("group_id", groupId)
    .order("display_order", { ascending: true });
  if (error) throw fromDbError(error, "loadMembers");
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    upiId: m.upi_id,
    displayOrder: m.display_order,
    archived: m.archived_at !== null,
  }));
}

/** R55: every referenced member id must belong to the group, otherwise 404. */
export function assertMembersBelong(members: readonly MemberRow[], ids: readonly (string | null | undefined)[]): void {
  const known = new Set(members.map((m) => m.id));
  for (const id of ids) if (id && !known.has(id)) throw notFound();
}

const EXPENSE_SELECT =
  "id, description, category, notes, expense_date, currency, amount_minor, fx_rate::text, fx_rate_date, fx_source, " +
  "base_amount_minor, split_type, receipt_id, recurring_rule_id, created_by_member_id, created_at, updated_at, deleted_at, " +
  "expense_payers(member_id, amount_minor, base_amount_minor), " +
  "expense_splits(member_id, input_value::text, owed_minor, owed_base_minor)";

type DbExpense = {
  id: string;
  description: string;
  category: string;
  notes: string | null;
  expense_date: string;
  currency: string;
  amount_minor: number;
  fx_rate: string;
  fx_rate_date: string;
  fx_source: ExpenseRow["fxSource"];
  base_amount_minor: number;
  split_type: ExpenseRow["splitType"];
  receipt_id: string | null;
  recurring_rule_id: string | null;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  expense_payers: { member_id: string; amount_minor: number; base_amount_minor: number }[];
  expense_splits: { member_id: string; input_value: string | null; owed_minor: number; owed_base_minor: number }[];
};

function trimRate(rate: string): string {
  return rate.includes(".") ? rate.replace(/0+$/, "").replace(/\.$/, "") : rate;
}

export function toExpense(e: DbExpense, memberOrder: Map<string, number>): ExpenseRow {
  const byOrder = <T extends { member_id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => (memberOrder.get(a.member_id) ?? 0) - (memberOrder.get(b.member_id) ?? 0));
  return {
    id: e.id,
    description: e.description,
    category: e.category,
    notes: e.notes,
    expenseDate: e.expense_date,
    currency: e.currency,
    amountMinor: Number(e.amount_minor),
    fxRate: trimRate(e.fx_rate),
    fxRateDate: e.fx_rate_date,
    fxSource: e.fx_source,
    baseAmountMinor: Number(e.base_amount_minor),
    splitType: e.split_type,
    receiptId: e.receipt_id,
    recurringRuleId: e.recurring_rule_id,
    createdByMemberId: e.created_by_member_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    deletedAt: e.deleted_at,
    payers: byOrder(e.expense_payers).map((p) => ({
      memberId: p.member_id,
      amountMinor: Number(p.amount_minor),
      baseAmountMinor: Number(p.base_amount_minor),
    })),
    splits: byOrder(e.expense_splits).map((s) => ({
      memberId: s.member_id,
      inputValue: s.input_value === null ? null : Number(s.input_value),
      owedMinor: Number(s.owed_minor),
      owedBaseMinor: Number(s.owed_base_minor),
    })),
  };
}

const PAGE = 1000; // PostgREST max rows per request on Supabase

/** All expenses of a group (paged under the hood), newest first. */
export async function loadAllExpenses(
  groupId: string,
  members: readonly MemberRow[],
  opts: { includeDeleted?: boolean } = {},
): Promise<ExpenseRow[]> {
  const order = new Map(members.map((m) => [m.id, m.displayOrder]));
  const out: ExpenseRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db().from("expenses").select(EXPENSE_SELECT).eq("group_id", groupId);
    if (!opts.includeDeleted) q = q.is("deleted_at", null);
    const { data, error } = await q
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<DbExpense[]>();
    if (error) throw fromDbError(error, "loadAllExpenses");
    out.push(...(data ?? []).map((e) => toExpense(e, order)));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function loadExpensePage(
  groupId: string,
  members: readonly MemberRow[],
  offset: number,
  limit = 50,
): Promise<{ items: ExpenseRow[]; hasMore: boolean }> {
  const order = new Map(members.map((m) => [m.id, m.displayOrder]));
  const { data, error } = await db()
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit)
    .returns<DbExpense[]>();
  if (error) throw fromDbError(error, "loadExpensePage");
  const rows = (data ?? []).map((e) => toExpense(e, order));
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function loadExpense(groupId: string, expenseId: string, members: readonly MemberRow[]): Promise<ExpenseRow> {
  const order = new Map(members.map((m) => [m.id, m.displayOrder]));
  const { data, error } = await db()
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("group_id", groupId)
    .eq("id", expenseId)
    .maybeSingle<DbExpense>();
  if (error) throw fromDbError(error, "loadExpense");
  if (!data) throw notFound();
  return toExpense(data, order);
}

export async function loadSettlements(groupId: string, opts: { includeDeleted?: boolean } = {}): Promise<SettlementRow[]> {
  const out: SettlementRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db()
      .from("settlements")
      .select("id, from_member_id, to_member_id, amount_minor, settled_on, method, note, created_by_member_id, created_at, deleted_at")
      .eq("group_id", groupId);
    if (!opts.includeDeleted) q = q.is("deleted_at", null);
    const { data, error } = await q
      .order("settled_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw fromDbError(error, "loadSettlements");
    out.push(
      ...(data ?? []).map((s) => ({
        id: s.id,
        fromMemberId: s.from_member_id,
        toMemberId: s.to_member_id,
        amountMinor: Number(s.amount_minor),
        settledOn: s.settled_on,
        method: s.method,
        note: s.note,
        createdByMemberId: s.created_by_member_id,
        createdAt: s.created_at,
        deletedAt: s.deleted_at,
      })),
    );
    if (!data || data.length < PAGE) break;
  }
  return out;
}
