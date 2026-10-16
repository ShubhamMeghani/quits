"use client";

// R61, R64: "Type it" — a sentence in English or Hinglish (or dictated via the keyboard mic) is
// parsed on the server and only fills the form below. Nothing is saved until the user taps Save.
import { useState } from "react";
import { Button, Notice, textareaClass } from "@/app/_components/ui";
import { NL_MAX_CHARS, type NlFlag, type NlResult } from "@/lib/nlparse";

export function flagMessage(f: NlFlag, baseCurrency: string): string {
  const v = f.value ? `"${f.value}"` : "";
  switch (f.field) {
    case "payer":
      if (f.reason === "ambiguous") return `${v} matches more than one person — choose who paid.`;
      if (f.reason === "unknown") return `Couldn't find ${v} in this group — choose who paid.`;
      if (f.reason === "no-me") return "Pick who you are first, then choose who paid.";
      return "Who paid? Choose below.";
    case "participants":
      if (f.reason === "missing") return "Who is it split between? Check the people below.";
      if (f.reason === "ambiguous") return `${v} matches more than one person — tick the right people below.`;
      return `Couldn't find ${v} in this group — tick the right people below.`;
    case "amount":
      return "Enter the amount.";
    case "split":
      return "The split didn't add up — fill it in below.";
    case "currency":
      return `${v} isn't supported — using ${baseCurrency}.`;
    case "date":
      return "Couldn't read the date — check it below.";
    case "category":
      return "Choose a category below.";
    case "description":
      return "Add a description.";
  }
}

export function TypeIt({ token, me, onFill }: { token: string; me: string | null; onFill: (r: NlResult) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  const fill = async () => {
    setBusy(true);
    setError(null);
    setFilled(false);
    try {
      const res = await fetch(`/api/g/${token}/expenses/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, me }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<NlResult> & { error?: string };
      if (!res.ok || !body.prefill) {
        setError(body.error ?? "Couldn't understand that — fill in the form");
        return;
      }
      onFill({ prefill: body.prefill, flags: body.flags ?? [] });
      setFilled(true);
    } catch {
      setError("Couldn't understand that — fill in the form");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="typeit-h" className="flex flex-col gap-2 rounded-2xl border border-teal-200 bg-teal-50 p-3">
      <label id="typeit-h" htmlFor="typeit" className="font-semibold">
        Type it
      </label>
      <textarea
        id="typeit"
        className={textareaClass}
        rows={2}
        maxLength={NL_MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "Rahul paid 600 for pizza, split with Amit and me"'
        // D-25: the cursor starts here on a new expense.
        autoFocus
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted">
          {text.length}/{NL_MAX_CHARS} · English or Hinglish. Tip: tap the mic on your keyboard to speak.
        </p>
        <Button variant="secondary" onClick={fill} disabled={busy || !text.trim()} className="shrink-0">
          {busy ? "Reading…" : "Fill form"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {filled && <Notice tone="ok">Filled in — check everything below, then tap Add expense.</Notice>}
    </section>
  );
}
