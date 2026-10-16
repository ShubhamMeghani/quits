"use client";

// R47: one-tap demo; R49: reset a demo group under the same link.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createDemoAction, resetDemoAction } from "@/app/actions";
import { useIdentity } from "./identity";
import { Button, Notice } from "./ui";

export function TryDemoButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(null);
      const r = await createDemoAction();
      if (!r.ok) return setError(r.message);
      router.push(`/g/${r.data.token}`);
    });
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={go} disabled={pending} className="min-h-14 text-lg">
        {pending ? "Setting up the demo…" : "Try the demo"}
      </Button>
      <p className="text-center text-sm text-muted">A sample flat with rent, Swiggy orders, a Goa trip and an itemized receipt. Nothing to set up.</p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function ResetDemoButton() {
  const { group, me } = useIdentity();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!group.isDemo) return null;
  const reset = () =>
    start(async () => {
      const r = await resetDemoAction(group.token, me ?? null);
      setConfirming(false);
      setMessage(r.ok ? { tone: "ok", text: "Demo data restored." } : { tone: "error", text: r.message });
    });
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-amber-900">This is a demo group</p>
      <p className="text-sm text-amber-900">Reset it to bring back the original sample data. The link stays the same.</p>
      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={reset} disabled={pending}>
            {pending ? "Resetting…" : "Yes, reset"}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Reset demo
        </Button>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
