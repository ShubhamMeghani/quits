import "server-only";
import { todayIST } from "@/lib/currency";
import { buildDemoSeed } from "@/lib/demo-seed";
import { receiptDiff } from "@/lib/receipt";
import { notFound } from "@/server/errors";
import { loadMembers, requireGroup } from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { generateToken } from "@/server/token";

/** The seed as JSON for the demo RPCs (member keys instead of ids; amounts precomputed). */
export function demoSeedJson(today = todayIST()) {
  const seed = buildDemoSeed(today);
  return {
    group: seed.group,
    members: seed.members.map((m) => ({ key: m.key, name: m.name, upiId: m.upiId })),
    expenses: seed.expenses.map((e) => ({
      description: e.description,
      category: e.category,
      notes: e.notes,
      date: e.date,
      currency: e.currency,
      amountMinor: e.amounts.amountMinor,
      fxRate: e.fxRate,
      fxRateDate: e.fxRateDate,
      fxSource: e.fxSource,
      baseAmountMinor: e.amounts.baseAmountMinor,
      splitType: e.splitType,
      payers: e.amounts.payers,
      splits: e.amounts.splits,
      receipt: e.receipt
        ? {
            merchant: e.receipt.data.merchant,
            taxMinor: e.receipt.data.taxMinor,
            serviceMinor: e.receipt.data.serviceMinor,
            tipMinor: e.receipt.data.tipMinor,
            discountMinor: e.receipt.data.discountMinor,
            roundOffMinor: e.receipt.data.roundOffMinor,
            totalMinor: e.receipt.data.totalMinor,
            diffMinor: receiptDiff(e.receipt.data),
            items: e.receipt.data.items.map((it, i) => ({ ...it, assignees: e.receipt!.assignees[i] })),
          }
        : null,
      // The demo's monthly Flat rent rule; this expense is its latest occurrence (next due in the future).
      recurring: e.recurring,
    })),
    settlements: seed.settlements,
  };
}

/** R47: lazily deletes demos older than 7 days, then creates a fresh demo group. */
export async function createDemo(): Promise<{ token: string }> {
  const token = generateToken();
  await rpc("demo_create", { p_token: token, p_seed: demoSeedJson() });
  return { token };
}

/** R49: wipe and re-seed a demo group under the same token; non-demo groups are rejected. */
export async function resetDemo(token: unknown, actor?: unknown): Promise<void> {
  const group = await requireGroup(token);
  if (!group.isDemo) throw notFound();
  const members = await loadMembers(group.id);
  const actorMemberId = actorId(members, actor);
  const who = members.find((m) => m.id === actorMemberId)?.name;
  await rpc("demo_reset", {
    p_group_id: group.id,
    p_seed: demoSeedJson(),
    p_activity: { summary: who ? `${who} reset the demo` : "Demo reset" },
  });
}
