import "server-only";
import { db } from "@/server/db";
import { fromDbError, invalid, notFound } from "@/server/errors";
import { summaries } from "@/server/activity";
import { assertMembersBelong, loadMembers, loadSettlements, requireGroup } from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { idSchema, parseInput, settlementInputSchema, type SettlementInput } from "@/server/schemas";

/** R23: record a payment (from "Mark as paid" or manual entry). Amounts are in the base currency. */
export async function createSettlement(token: unknown, input: SettlementInput, actor?: unknown): Promise<{ id: string }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const data = parseInput(settlementInputSchema, input);
  const actorMemberId = actorId(members, actor);
  assertMembersBelong(members, [data.fromMemberId, data.toMemberId]);
  if (data.fromMemberId === data.toMemberId) throw invalid("Choose two different people");
  const names = new Map(members.map((m) => [m.id, m.name]));
  const id = await rpc<string>("create_settlement", {
    p_group_id: group.id,
    p_settlement: {
      from_member_id: data.fromMemberId,
      to_member_id: data.toMemberId,
      amount_minor: data.amountMinor,
      settled_on: data.settledOn,
      method: data.method,
      note: data.note ?? null,
      created_by_member_id: actorMemberId,
    },
    p_activity: {
      actor_member_id: actorMemberId,
      action: "settlement.created",
      summary: summaries.settlementCreated(
        names.get(data.fromMemberId)!,
        names.get(data.toMemberId)!,
        data.amountMinor,
        group.baseCurrency,
        data.method,
      ),
    },
  });
  return { id };
}

async function setDeleted(token: unknown, settlementId: unknown, deleted: boolean, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, settlementId);
  const actorMemberId = actorId(members, actor);
  const { data, error } = await db()
    .from("settlements")
    .select("from_member_id, to_member_id, amount_minor")
    .eq("group_id", group.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error, "settlement.lookup");
  if (!data) throw notFound();
  const names = new Map(members.map((m) => [m.id, m.name]));
  const args = [names.get(data.from_member_id) ?? "?", names.get(data.to_member_id) ?? "?", Number(data.amount_minor), group.baseCurrency] as const;
  await rpc("set_settlement_deleted", {
    p_group_id: group.id,
    p_settlement_id: id,
    p_deleted: deleted,
    p_activity: {
      actor_member_id: actorMemberId,
      action: deleted ? "settlement.deleted" : "settlement.restored",
      summary: deleted ? summaries.settlementDeleted(...args) : summaries.settlementRestored(...args),
    },
  });
}

/** Recent non-deleted settlements, newest first (Settle screen). */
export async function listSettlements(token: unknown, limit = 20) {
  const group = await requireGroup(token);
  const all = await loadSettlements(group.id);
  return all.slice(0, limit);
}

/** R11: soft delete a settlement. */
export const deleteSettlement = (token: unknown, id: unknown, actor?: unknown) => setDeleted(token, id, true, actor);
/** R12 (Should): restore a settlement. */
export const restoreSettlement = (token: unknown, id: unknown, actor?: unknown) => setDeleted(token, id, false, actor);
