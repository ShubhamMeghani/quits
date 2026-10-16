"use client";

// R42 activity log (newest first, 50 per page) with Restore on deletions (R12, Should).
import { useState, useTransition } from "react";
import { loadMoreActivityAction, restoreExpenseAction, restoreSettlementAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Empty, Notice } from "@/app/_components/ui";
import { formatTimestamp } from "@/app/_lib/format";
import type { ActivityEntry } from "@/server/groups";

export function ActivityList({ initial, hasMore: initialHasMore }: { initial: ActivityEntry[]; hasMore: boolean }) {
  const { group, me } = useIdentity();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [seen, setSeen] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
    setHasMore(initialHasMore);
  }

  if (items.length === 0) return <Empty title="No activity yet">Changes to expenses, payments and members show up here.</Empty>;

  const loadMore = () =>
    start(async () => {
      const r = await loadMoreActivityAction(group.token, items.length);
      if (!r.ok) return setError(r.message);
      setItems((xs) => [...xs, ...r.data.items.filter((x) => !xs.some((y) => y.id === x.id))]);
      setHasMore(r.data.hasMore);
    });

  const restore = (a: ActivityEntry) =>
    start(async () => {
      setError(null);
      if (!a.entityId) return;
      const r =
        a.entityType === "expense"
          ? await restoreExpenseAction(group.token, a.entityId, me ?? null)
          : await restoreSettlementAction(group.token, a.entityId, me ?? null);
      if (!r.ok) setError(r.code === "NOT_FOUND" ? "Already restored." : r.message);
    });

  return (
    <div className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
        {items.map((a) => (
          <li key={a.id} className="flex flex-col gap-1 px-4 py-3">
            <p>
              <span className="font-semibold">{a.actorName}</span> <span className="break-words">{a.summary}</span>
            </p>
            <div className="flex min-h-6 items-center justify-between gap-2">
              <time dateTime={a.createdAt} className="text-sm text-muted">
                {formatTimestamp(a.createdAt)}
              </time>
              {a.restorable && (
                <Button variant="ghost" onClick={() => restore(a)} disabled={pending}>
                  Restore
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {hasMore && (
        <Button variant="secondary" onClick={loadMore} disabled={pending}>
          {pending ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
