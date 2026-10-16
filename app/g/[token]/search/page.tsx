import Link from "next/link";
import { Card, Empty, inputClass, PageHeader, buttonClass } from "@/app/_components/ui";
import { formatDate, money } from "@/app/_lib/format";
import { CATEGORIES } from "@/lib/splits";
import { formatPercent, percentShares } from "@/lib/stats";
import { loadMembers, requireGroup } from "@/server/context";
import { searchExpenses } from "@/server/search";

// R40 search (text, categories, person, date range; count and total) and R41 charts (Should).
export default async function SearchPage({ params, searchParams }: PageProps<"/g/[token]/search">) {
  const { token } = await params;
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const cats = ([] as string[]).concat(sp.cat ?? []).filter((c) => (CATEGORIES as readonly string[]).includes(c));
  const filters = { q: str(sp.q), categories: cats as (typeof CATEGORIES)[number][], person: str(sp.person), from: str(sp.from), to: str(sp.to) };
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const result = await searchExpenses(token, filters);
  const base = group.baseCurrency;
  const name = new Map(members.map((m) => [m.id, m.name]));
  const people = members.map((m) => ({ id: m.id, name: m.name, v: result.perPerson[m.id] ?? 0 })).filter((p) => p.v > 0).sort((a, b) => b.v - a.v);
  const categories = Object.entries(result.perCategory).sort((a, b) => b[1] - a[1]);
  const categoryShares = percentShares(categories.map(([, v]) => v));
  const maxPerson = Math.max(1, ...people.map((p) => p.v));
  const maxCat = Math.max(1, ...categories.map(([, v]) => v));
  const active = !!(filters.q || cats.length || filters.person || filters.from || filters.to);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Search & stats" back={`/g/${token}/group`} />
      <form method="get" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" role="search">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Text in description or notes
          <input name="q" defaultValue={filters.q ?? ""} className={inputClass} placeholder="e.g. swiggy" />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Categories</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label key={c} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-teal-50">
                <input type="checkbox" name="cat" value={c} defaultChecked={cats.includes(c)} className="h-4 w-4 accent-teal-700" />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Person (paid or shared)
          <select name="person" defaultValue={filters.person ?? ""} className={inputClass}>
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            From
            <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            To
            <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputClass} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/g/${token}/search`} className={buttonClass("secondary")}>
            Clear
          </Link>
          <button type="submit" className={buttonClass("primary")}>
            Search
          </button>
        </div>
      </form>

      <Card>
        <p className="text-sm text-muted">{active ? "Matching expenses" : "All expenses"}</p>
        <p className="text-xl font-bold" aria-live="polite">
          {result.count} {result.count === 1 ? "expense" : "expenses"} · {money(result.totalBaseMinor, base)}
        </p>
      </Card>

      {people.length > 0 && (
        <section aria-labelledby="per-person">
          <h2 id="per-person" className="mb-2 text-lg font-bold">
            Spending per person
          </h2>
          <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            {people.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-semibold">{money(p.v, base)}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-3 rounded-full bg-brand" style={{ width: `${Math.max(2, (p.v / maxPerson) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {categories.length > 0 && (
        <section aria-labelledby="per-category">
          <h2 id="per-category" className="mb-2 text-lg font-bold">
            Spending per category
          </h2>
          <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            {categories.map(([c, v], i) => (
              <li key={c} className="flex flex-col gap-1" data-testid="category-row">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{c}</span>
                  <span className="whitespace-nowrap">
                    <span className="font-semibold">{money(v, base)}</span>{" "}
                    <span className="text-muted" data-testid="category-percent">
                      · {formatPercent(categoryShares[i])} of total
                    </span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-3 rounded-full bg-amber-500" style={{ width: `${Math.max(2, (v / maxCat) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="results">
        <h2 id="results" className="mb-2 text-lg font-bold">
          Results
        </h2>
        {result.items.length === 0 ? (
          <Empty title="No matching expenses">Try fewer filters.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.items.map((e) => (
              <li key={e.id}>
                <Link href={`/g/${token}/expenses/${e.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2 hover:border-brand">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.description}</span>
                    <span className="block truncate text-sm text-muted">
                      {formatDate(e.expenseDate)} · {e.category} · {e.payers.map((p) => name.get(p.memberId)).join(", ")}
                    </span>
                  </span>
                  <span className="font-semibold">{money(e.baseAmountMinor, base)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result.count > result.items.length && <p className="mt-2 text-sm text-muted">Showing the newest {result.items.length}.</p>}
      </section>
    </div>
  );
}
