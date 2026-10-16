"use client";

import { useState, useTransition } from "react";
import { updateRuleAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Empty, Notice } from "@/app/_components/ui";
import { formatDate, money } from "@/app/_lib/format";
import type { RuleView } from "@/server/recurring";

// R46 (Should): pause, resume or stop a rule; already-created expenses stay.
export function RulesList({ rules }: { rules: RuleView[] }) {
  const { group, me } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (rules.length === 0) {
    return <Empty title="No recurring expenses">When adding an expense, choose “Repeat: monthly” for rent or Wi-Fi.</Empty>;
  }
  const act = (id: string, change: "pause" | "resume" | "delete") =>
    start(async () => {
      setError(null);
      const r = await updateRuleAction(group.token, id, change, me ?? null);
      if (!r.ok) setError(r.message);
    });
  return (
    <div className="flex flex-col gap-2">
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="flex flex-col gap-2">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-semibold">{r.description}</p>
              <p className="font-semibold">{money(r.amountMinor, r.currency)}</p>
            </div>
            <p className="text-sm text-muted">
              Every {r.frequency === "weekly" ? "week" : "month"} from {formatDate(r.anchorDate)}
              {r.endDate ? ` until ${formatDate(r.endDate)}` : ""} · {r.active ? `next on ${formatDate(r.nextDue)}` : "paused"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => act(r.id, r.active ? "pause" : "resume")} disabled={pending}>
                {r.active ? "Pause" : "Resume"}
              </Button>
              <Button variant="danger" onClick={() => act(r.id, "delete")} disabled={pending}>
                Stop repeating
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Due expenses are added automatically the next time anyone opens the group.</p>
    </div>
  );
}
