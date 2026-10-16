"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExpenseAction, restoreExpenseAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, LinkButton, Notice } from "@/app/_components/ui";

export function ExpenseActions({ id, deleted, editable }: { id: string; deleted: boolean; editable: boolean }) {
  const { group, me } = useIdentity();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const del = () =>
    start(async () => {
      const r = await deleteExpenseAction(group.token, id, me ?? null);
      if (!r.ok) return setError(r.message);
      router.push(`/g/${group.token}`);
    });
  const restore = () =>
    start(async () => {
      const r = await restoreExpenseAction(group.token, id, me ?? null);
      if (!r.ok) setError(r.message);
    });

  if (deleted) {
    return (
      <div className="flex flex-col gap-2">
        <Notice tone="warn">This expense was deleted. It no longer counts towards balances.</Notice>
        <Button variant="secondary" onClick={restore} disabled={pending}>
          {pending ? "Restoring…" : "Restore expense"}
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {editable ? (
          <LinkButton variant="secondary" href={`/g/${group.token}/expenses/${id}/edit`}>
            Edit
          </LinkButton>
        ) : (
          <span />
        )}
        <Button variant="danger" onClick={() => setConfirming(true)} disabled={pending}>
          Delete
        </Button>
      </div>
      {confirming && (
        <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-3" role="alertdialog" aria-label="Confirm delete">
          <p className="font-medium text-red-900">Delete this expense? Anyone in the group can restore it from Activity.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={del} disabled={pending}>
              {pending ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
