"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadMoreExpensesAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Card, Empty, Notice } from "@/app/_components/ui";
import { formatDate, money } from "@/app/_lib/format";
import type { ExpenseRow } from "@/server/context";

export function BalanceSummary({ balances, baseCurrency, expenseCount }: { balances: Record<string, number>; baseCurrency: string; expenseCount: number }) {
  const { me, group } = useIdentity();
  const mine = me ? (balances[me] ?? 0) : 0;
  return (
    <Card className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-muted">Your balance</p>
        <p className={`text-xl font-bold ${mine > 0 ? "text-ok" : mine < 0 ? "text-danger" : ""}`}>
          {mine === 0 ? "You're settled up" : mine > 0 ? `You get back ${money(mine, baseCurrency)}` : `You owe ${money(-mine, baseCurrency)}`}
        </p>
        <p className="text-sm text-muted">{expenseCount === 1 ? "1 expense" : `${expenseCount} expenses`}</p>
      </div>
      {mine !== 0 && (
        <Link href={`/g/${group.token}/settle`} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl bg-brand px-4 font-semibold text-brand-fg">
          Settle up
        </Link>
      )}
    </Card>
  );
}

/** Your position on one expense: a short label and (when relevant) an amount, shown on two lines. */
function myLine(e: ExpenseRow, me: string | null | undefined, baseCurrency: string): { label: string; amount: string | null; tone: string } {
  if (!me) return { label: "", amount: null, tone: "" };
  const paid = e.payers.find((p) => p.memberId === me)?.baseAmountMinor ?? 0;
  const owed = e.splits.find((s) => s.memberId === me)?.owedBaseMinor ?? 0;
  const net = paid - owed;
  if (paid === 0 && owed === 0) return { label: "not involved", amount: null, tone: "text-muted" };
  if (net > 0) return { label: "you lent", amount: money(net, baseCurrency), tone: "text-ok" };
  if (net < 0) return { label: "you owe", amount: money(-net, baseCurrency), tone: "text-danger" };
  return { label: "share paid", amount: null, tone: "text-muted" };
}

export function ExpenseList({ initial, hasMore: initialHasMore, baseCurrency }: { initial: ExpenseRow[]; hasMore: boolean; baseCurrency: string }) {
  const { group, me, nameOf } = useIdentity();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    // Server data changed (after an edit or refresh): restart from the fresh first page.
    setSeen(initial);
    setItems(initial);
    setHasMore(initialHasMore);
  }

  if (items.length === 0) {
    return (
      <Empty title="No expenses yet">
        Tap <span className="font-semibold">+</span> to add the first one.
      </Empty>
    );
  }

  const loadMore = () =>
    start(async () => {
      setError(null);
      const r = await loadMoreExpensesAction(group.token, items.length);
      if (!r.ok) return setError(r.message);
      setItems((xs) => [...xs, ...r.data.items.filter((x) => !xs.some((y) => y.id === x.id))]);
      setHasMore(r.data.hasMore);
    });

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((e) => {
          const line = myLine(e, me, baseCurrency);
          const payer = e.payers.length === 1 ? nameOf(e.payers[0].memberId) : `${e.payers.length} people`;
          return (
            <li key={e.id}>
              <Link href={`/g/${group.token}/expenses/${e.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:border-brand">
                <div className="flex w-10 shrink-0 flex-col items-center text-xs font-semibold uppercase leading-tight text-muted">
                  {formatDate(e.expenseDate)
                    .replace(/ \d{4}$/, "")
                    .split(" ")
                    .map((part) => (
                      <span key={part} className="whitespace-nowrap">
                        {part}
                      </span>
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.description}</p>
                  <p className="truncate text-sm text-muted">
                    {payer} paid {money(e.amountMinor, e.currency)}
                    {e.currency !== baseCurrency && ` (${money(e.baseAmountMinor, baseCurrency)})`}
                  </p>
                </div>
                <p className={`flex shrink-0 flex-col items-end text-xs font-semibold leading-tight ${line.tone}`}>
                  <span className="whitespace-nowrap">{line.label}</span>
                  {line.amount && <span className="whitespace-nowrap text-sm">{line.amount}</span>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      {error && <Notice tone="error">{error}</Notice>}
      {hasMore && (
        <Button variant="secondary" onClick={loadMore} disabled={pending}>
          {pending ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
