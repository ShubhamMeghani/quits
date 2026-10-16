import "server-only";
import { computeBalances } from "@/lib/splits";
import { AppError, notFound } from "@/server/errors";
import { summaries } from "@/server/activity";
import { loadAllExpenses, loadMembers, loadSettlements, requireGroup } from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { idSchema, memberInputSchema, parseInput, type MemberInput } from "@/server/schemas";

/** R6: add a member (unique name, optional UPI ID). */
export async function addMember(token: unknown, input: MemberInput, actor?: unknown): Promise<{ id: string }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const data = parseInput(memberInputSchema, input);
  const actorMemberId = actorId(members, actor);
  if (members.length >= 50) throw new AppError("VALIDATION", 400, "A group can have at most 50 members");
  const id = await rpc<string>("add_member", {
    p_group_id: group.id,
    p_name: data.name,
    p_upi_id: data.upiId ?? null,
    p_activity: { actor_member_id: actorMemberId, action: "member.added", summary: summaries.memberAdded(data.name) },
  });
  return { id };
}

/** R6: rename a member or set/clear their UPI ID. */
export async function updateMember(token: unknown, memberId: unknown, input: MemberInput, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, memberId);
  const current = members.find((m) => m.id === id);
  if (!current) throw notFound();
  const data = parseInput(memberInputSchema, input);
  const actorMemberId = actorId(members, actor);
  const upiId = data.upiId ? data.upiId : null;
  await rpc("update_member", {
    p_group_id: group.id,
    p_member_id: id,
    p_name: data.name,
    p_upi_id: upiId,
    p_archived: current.archived,
    p_activity: {
      actor_member_id: actorMemberId,
      action: "member.updated",
      summary: summaries.memberUpdated({ name: current.name, upiId: current.upiId }, { name: data.name, upiId }),
    },
  });
}

/** R7 (Should): archive a member whose balance is 0. */
export async function archiveMember(token: unknown, memberId: unknown, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, memberId);
  const current = members.find((m) => m.id === id);
  if (!current) throw notFound();
  const actorMemberId = actorId(members, actor);
  const [expenses, settlements] = await Promise.all([loadAllExpenses(group.id, members), loadSettlements(group.id)]);
  const balances = computeBalances(members.map((m) => m.id), expenses, settlements);
  if (balances[id] !== 0) throw new AppError("BALANCE_NOT_ZERO", 409, "Settle up first");
  await rpc("update_member", {
    p_group_id: group.id,
    p_member_id: id,
    p_name: current.name,
    p_upi_id: current.upiId,
    p_archived: true,
    p_activity: { actor_member_id: actorMemberId, action: "member.archived", summary: summaries.memberArchived(current.name) },
  });
}
