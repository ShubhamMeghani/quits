import "server-only";
import { z } from "zod";
import { sum, type Minor } from "@/lib/money";
import { CATEGORIES } from "@/lib/splits";
import { loadAllExpenses, loadMembers, requireGroup, type ExpenseRow } from "@/server/context";
import { dateSchema, idSchema } from "@/server/schemas";

// R40 search (all filters combined with AND) and R41 chart data, over non-deleted expenses.

export const searchFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).optional(),
  person: idSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
export type SearchFilters = z.input<typeof searchFiltersSchema>;

export type SearchResult = {
  items: ExpenseRow[];
  count: number;
  totalBaseMinor: Minor;
  perPerson: Record<string, Minor>;
  perCategory: Record<string, Minor>;
};

export function matches(e: ExpenseRow, f: z.infer<typeof searchFiltersSchema>): boolean {
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (!e.description.toLowerCase().includes(needle) && !(e.notes ?? "").toLowerCase().includes(needle)) return false;
  }
  if (f.categories?.length && !f.categories.includes(e.category as (typeof CATEGORIES)[number])) return false;
  if (f.person && !e.payers.some((p) => p.memberId === f.person) && !e.splits.some((s) => s.memberId === f.person)) return false;
  if (f.from && e.expenseDate < f.from) return false;
  if (f.to && e.expenseDate > f.to) return false;
  return true;
}

export async function searchExpenses(token: unknown, filters: SearchFilters, limit = 200): Promise<SearchResult> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const parsed = searchFiltersSchema.safeParse(filters);
  const f = parsed.success ? parsed.data : {};
  const all = await loadAllExpenses(group.id, members);
  const hits = all.filter((e) => matches(e, f));
  const perPerson: Record<string, Minor> = Object.fromEntries(members.map((m) => [m.id, 0]));
  const perCategory: Record<string, Minor> = {};
  for (const e of hits) {
    for (const s of e.splits) perPerson[s.memberId] = (perPerson[s.memberId] ?? 0) + s.owedBaseMinor;
    perCategory[e.category] = (perCategory[e.category] ?? 0) + e.baseAmountMinor;
  }
  return {
    items: hits.slice(0, limit),
    count: hits.length,
    totalBaseMinor: sum(hits.map((e) => e.baseAmountMinor)),
    perPerson,
    perCategory,
  };
}
