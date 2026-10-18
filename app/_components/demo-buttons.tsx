"use client";

// R47/R73: the demo (a small link on the home page, and the /demo page it opens); R49: reset a
// demo group under the same link.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDemoAction, resetDemoAction } from "@/app/actions";
import { useIdentity } from "./identity";
import { Button, Notice } from "./ui";

/** R73: the secondary demo entry point, directly under "Create group" on the home page. */
export function DemoLink() {
  return (
    <p className="text-center text-sm text-muted">
      Just looking?{" "}
      {/* No prefetch: the demo is created only when someone actually opens /demo. */}
      <Link href="/demo" prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline">
        Try a demo group →
      </Link>
    </p>
  );
}

/**
 * R73: /demo creates a fresh demo group (R47) and opens it. It runs in the browser on purpose, so
 * link-preview bots that fetch a shared /demo link (and run no JavaScript) never create groups (D-41).
 */
export function DemoStarter() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);
  const go = () =>
    start(async () => {
      setError(null);
      const r = await createDemoAction();
      if (!r.ok) return setError(r.message);
      router.replace(`/g/${r.data.token}`);
    });
  useEffect(() => {
    // Once per page load, even if React runs the effect twice in development.
    if (started.current) return;
    started.current = true;
    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button onClick={go} disabled={pending}>
            {pending ? "Setting up the demo…" : "Try again"}
          </Button>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">
            Back to Quits
          </Link>
        </>
      ) : (
        <>
          <span className="h-10 w-10 rounded-full border-4 border-brand border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
          <p className="text-lg font-semibold">Setting up the demo…</p>
          <p className="text-sm text-muted">A sample flat with rent, Swiggy orders, a Goa trip and an itemized receipt.</p>
        </>
      )}
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
    <div className="flex flex-col gap-2 rounded-2xl border border-warn-border bg-warn-soft p-4">
      <p className="font-semibold text-warn-soft-fg">This is a demo group</p>
      <p className="text-sm text-warn-soft-fg">Reset it to bring back the original sample data. The link stays the same.</p>
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
