import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/app/_components/ui";
import { formatDate, money } from "@/app/_lib/format";
import { loadExpense, loadMembers, requireGroup } from "@/server/context";
import { idSchema } from "@/server/schemas";
import { loadReceipt } from "@/server/receipts";
import { ExpenseActions } from "./expense-actions";
import { ReceiptBreakdown } from "./receipt-breakdown";

const SPLIT_NAMES = { equal: "Split equally", exact: "Exact amounts", percent: "By percentage", shares: "By shares", itemized: "Itemized receipt" } as const;
const SOURCE_NAMES = { identity: "", frankfurter: "Frankfurter", manual: "entered manually" } as const;

export default async function ExpensePage({ params }: PageProps<"/g/[token]/expenses/[id]">) {
  const { token, id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const e = await loadExpense(group.id, id, members).catch(() => null);
  if (!e) notFound();
  const name = new Map(members.map((m) => [m.id, m.name]));
  const base = group.baseCurrency;
  const foreign = e.currency !== base;
  const receipt = e.receiptId ? await loadReceipt(group.id, e.receiptId).catch(() => null) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={e.description} back={`/g/${token}`} />
      <Card>
        <p className="text-3xl font-bold">{money(e.amountMinor, e.currency)}</p>
        {foreign && (
          <p className="mt-1 text-muted">
            = {money(e.baseAmountMinor, base)} · 1 {e.currency} = {e.fxRate} {base} on {formatDate(e.fxRateDate)}
            {SOURCE_NAMES[e.fxSource] && ` (${SOURCE_NAMES[e.fxSource]})`}
          </p>
        )}
        <p className="mt-2 text-sm text-muted">
          {formatDate(e.expenseDate)} · {e.category} · {SPLIT_NAMES[e.splitType]}
        </p>
        {e.notes && <p className="mt-2 whitespace-pre-wrap">{e.notes}</p>}
      </Card>

      <section>
        <h2 className="mb-2 font-bold">Paid by</h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {e.payers.map((p) => (
            <li key={p.memberId} className="flex min-h-12 items-center justify-between px-4">
              <span>{name.get(p.memberId)}</span>
              <span className="font-semibold">{money(p.amountMinor, e.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-bold">Shares</h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {e.splits.map((s) => (
            <li key={s.memberId} className="flex min-h-12 items-center justify-between gap-3 px-4">
              <span className="min-w-0 truncate">
                {name.get(s.memberId)}
                {e.splitType === "percent" && s.inputValue !== null && <span className="text-muted"> · {s.inputValue / 100}%</span>}
                {e.splitType === "shares" && s.inputValue !== null && <span className="text-muted"> · {s.inputValue} share{s.inputValue === 1 ? "" : "s"}</span>}
              </span>
              <span className="text-right">
                <span className="font-semibold">{money(s.owedBaseMinor, base)}</span>
                {foreign && <span className="block text-xs text-muted">{money(s.owedMinor, e.currency)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {receipt && <ReceiptBreakdown receipt={receipt} names={name} order={members.map((m) => m.id)} />}

      <ExpenseActions id={e.id} deleted={!!e.deletedAt} editable={e.splitType !== "itemized"} />
    </div>
  );
}
