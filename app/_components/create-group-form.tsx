"use client";

// R1: create a group (name, base currency, ≥ 2 members). The creator is the first member and is
// remembered on this device; the share screen (R2) opens next.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGroupAction } from "@/app/actions";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { rememberMe } from "./identity";
import { Button, Field, inputClass, Notice } from "./ui";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [people, setPeople] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const names = people.map((p) => p.trim()).filter(Boolean);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createGroupAction({ name, baseCurrency: currency, memberNames: names });
      if (!r.ok) return setError(r.message);
      rememberMe(r.data.token, r.data.firstMemberId);
      router.push(`/g/${r.data.token}/share?created=1`);
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Group name" htmlFor="cg-name">
        <input id="cg-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Flat 302 or Goa trip" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">People</legend>
        {people.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={i === 0 ? "Your name" : `Person ${i + 1}`}
              className={inputClass}
              value={p}
              onChange={(e) => setPeople((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={30}
              placeholder={i === 0 ? "Your name" : `Friend ${i}`}
            />
            {i > 1 && (
              <Button variant="ghost" aria-label={`Remove person ${i + 1}`} onClick={() => setPeople((xs) => xs.filter((_, j) => j !== i))}>
                ✕
              </Button>
            )}
          </div>
        ))}
        {people.length < 50 && (
          <Button variant="ghost" className="self-start" onClick={() => setPeople((xs) => [...xs, ""])}>
            + Add person
          </Button>
        )}
      </fieldset>
      <Field label="Currency" htmlFor="cg-cur" hint="Balances and settle-up use this currency.">
        <select id="cg-cur" className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={pending || !name.trim() || names.length < 2}>
        {pending ? "Creating…" : "Create group"}
      </Button>
      <p className="text-sm text-muted">No sign-up. Anyone with the group link can view and edit it.</p>
    </form>
  );
}
