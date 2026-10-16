import "server-only";
import { computeBalances } from "@/lib/splits";
import { naiveCount, settle, type SettlePlan } from "@/lib/simplify";
import { sum, type Minor } from "@/lib/money";
import { db } from "@/server/db";
import { AppError, fromDbError } from "@/server/errors";
import { generateToken } from "@/server/token";
import { summaries } from "@/server/activity";
import {
  assertMembersBelong,
  loadAllExpenses,
  loadMembers,
  loadSettlements,
  requireGroup,
  type GroupRow,
  type MemberRow,
} from "@/server/context";
import { createGroupSchema, groupSettingsSchema, idSchema, parseInput, type CreateGroupInput, type GroupSettingsInput } from "@/server/schemas";

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw fromDbError(error, fn);
  return data as T;
}

/** Validates an optional actor id (the device's chosen member) against the group (R55). */
export function actorId(members: readonly MemberRow[], actor: unknown): string | null {
  if (actor === null || actor === undefined || actor === "") return null;
  const id = parseInput(idSchema, actor);
  assertMembersBelong(members, [id]);
  return id;
}

/** R1: creates a group with a fresh 128-bit share token. */
export async function createGroup(input: CreateGroupInput): Promise<{ token: string; firstMemberId: string }> {
  const data = parseInput(createGroupSchema, input);
  const token = generateToken();
  const groupId = await rpc<string>("create_group", {
    p_token: token,
    p_name: data.name,
    p_base_currency: data.baseCurrency,
    p_member_names: data.memberNames,
  });
  const members = await loadMembers(groupId);
  return { token, firstMemberId: members[0].id };
}

export type GroupView = {
  group: GroupRow;
  members: MemberRow[];
  balances: Record<string, Minor>;
  plan: SettlePlan;
  naiveCount: number;
  expenseCount: number;
  totalBaseMinor: Minor;
};

/** R14, R19–R22: group, members, balances and the settle-up plan. */
export async function readGroup(token: unknown): Promise<GroupView> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const [expenses, settlements] = await Promise.all([loadAllExpenses(group.id, members), loadSettlements(group.id)]);
  const order = members.map((m) => m.id);
  const balances = computeBalances(order, expenses, settlements);
  if (sum(Object.values(balances)) !== 0) {
    console.error(`balance invariant violated for group ${group.id}`);
    throw new AppError("INTERNAL", 500, "Something went wrong. Please try again.");
  }
  const plan = settle(order.map((id) => ({ memberId: id, balance: balances[id] })));
  return {
    group,
    members,
    balances,
    plan,
    naiveCount: naiveCount(order, expenses, settlements),
    expenseCount: expenses.length,
    totalBaseMinor: sum(expenses.map((e) => e.baseAmountMinor)),
  };
}

/** R9 default split, R15 base-currency lock. */
export async function updateGroupSettings(token: unknown, input: GroupSettingsInput, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const data = parseInput(groupSettingsSchema, input);
  const actorMemberId = actorId(members, actor);
  if (data.defaultSplit) {
    assertMembersBelong(members, [...data.defaultSplit.participants, ...Object.keys(data.defaultSplit.weights)]);
  }
  const changes: string[] = [];
  if (data.name !== group.name) changes.push(`Name "${group.name}" → "${data.name}"`);
  if (data.baseCurrency !== group.baseCurrency) changes.push(`Base currency ${group.baseCurrency} → ${data.baseCurrency}`);
  if (JSON.stringify(data.defaultSplit) !== JSON.stringify(group.defaultSplit)) changes.push("Default split changed");
  await rpc("update_group_settings", {
    p_group_id: group.id,
    p_name: data.name,
    p_base_currency: data.baseCurrency,
    p_default_split: data.defaultSplit,
    p_activity: { actor_member_id: actorMemberId, action: "group.updated", summary: summaries.groupUpdated(changes) },
  });
}

export type ActivityEntry = {
  id: string;
  action: string;
  actorName: string;
  summary: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  restorable: boolean;
};

/** R42: newest first, 50 per page. */
export async function listActivity(token: unknown, offset = 0, limit = 50): Promise<{ items: ActivityEntry[]; hasMore: boolean }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const { data, error } = await db()
    .from("activity")
    .select("id, action, actor_member_id, summary, entity_type, entity_id, created_at")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit);
  if (error) throw fromDbError(error, "listActivity");
  // R12: a deletion entry offers Restore only while its expense/settlement is still deleted.
  const [delExp, delSet] = await Promise.all([
    db().from("expenses").select("id").eq("group_id", group.id).not("deleted_at", "is", null),
    db().from("settlements").select("id").eq("group_id", group.id).not("deleted_at", "is", null),
  ]);
  if (delExp.error) throw fromDbError(delExp.error, "listActivity.deleted");
  if (delSet.error) throw fromDbError(delSet.error, "listActivity.deleted");
  const deleted = new Set([...(delExp.data ?? []), ...(delSet.data ?? [])].map((r) => r.id as string));
  const rows = (data ?? []).map((a) => ({
    id: a.id,
    action: a.action,
    actorName: a.actor_member_id ? (names.get(a.actor_member_id) ?? "Someone") : "System",
    summary: a.summary,
    entityType: a.entity_type,
    entityId: a.entity_id,
    createdAt: a.created_at,
    restorable: a.action.endsWith(".deleted") && !!a.entity_id && deleted.has(a.entity_id),
  }));
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
