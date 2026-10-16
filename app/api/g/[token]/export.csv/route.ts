// R43: CSV export of a group's non-deleted expenses and settlements.
import { connection } from "next/server";
import { todayIST } from "@/lib/currency";
import { buildCsv, csvFilename } from "@/lib/csv";
import { findGroupByToken, loadAllExpenses, loadMembers, loadSettlements } from "@/server/context";

export async function GET(_request: Request, ctx: RouteContext<"/api/g/[token]/export.csv">) {
  await connection();
  const { token } = await ctx.params;
  const group = await findGroupByToken(token);
  if (!group) return new Response("Group not found", { status: 404 });
  const members = await loadMembers(group.id);
  const [expenses, settlements] = await Promise.all([loadAllExpenses(group.id, members), loadSettlements(group.id)]);
  const csv = buildCsv({
    members: members.map((m) => ({ id: m.id, name: m.name })),
    baseCurrency: group.baseCurrency,
    expenses: [...expenses].reverse().map((e) => ({
      date: e.expenseDate,
      description: e.description,
      category: e.category,
      notes: e.notes,
      currency: e.currency,
      amountMinor: e.amountMinor,
      fxRate: e.fxRate,
      baseAmountMinor: e.baseAmountMinor,
      payers: e.payers.map((p) => ({ memberId: p.memberId, amountMinor: p.amountMinor })),
      owedBase: Object.fromEntries(e.splits.map((s) => [s.memberId, s.owedBaseMinor])),
    })),
    settlements: [...settlements].reverse().map((s) => ({
      date: s.settledOn,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountMinor: s.amountMinor,
      note: s.note,
    })),
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(group.name, todayIST())}"`,
      "Cache-Control": "no-store",
    },
  });
}
