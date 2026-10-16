"use client";

// Group settings: name, base currency (locked once expenses exist, R15), default split (R9).
import { useState, useTransition } from "react";
import { updateGroupSettingsAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Field, inputClass, Notice } from "@/app/_components/ui";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { percentToBasisPoints } from "@/lib/splits";
import type { DefaultSplit } from "@/server/schemas";

type Type = DefaultSplit["type"];

export function SettingsForm({ defaultSplit, hasExpenses }: { defaultSplit: DefaultSplit | null; hasExpenses: boolean }) {
  const { group, members, me } = useIdentity();
  const active = members.filter((m) => !m.archived);
  const [name, setName] = useState(group.name);
  const [baseCurrency, setBaseCurrency] = useState(group.baseCurrency);
  const [type, setType] = useState<Type>(defaultSplit?.type ?? "equal");
  const [included, setIncluded] = useState<Set<string>>(new Set(defaultSplit?.participants ?? active.map((m) => m.id)));
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      active.map((m) => {
        const w = defaultSplit?.weights[m.id];
        if (w === undefined) return [m.id, type === "percent" ? "" : "1"];
        return [m.id, defaultSplit?.type === "percent" ? String(w / 100) : String(w)];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const build = (): DefaultSplit | string => {
    const participants = active.filter((m) => included.has(m.id)).map((m) => m.id);
    if (participants.length === 0) return "Choose at least one person";
    if (type === "equal") return { type, participants, weights: {} };
    const out: Record<string, number> = {};
    for (const id of participants) {
      const raw = (weights[id] ?? "").trim() || "0";
      const v = type === "percent" ? percentToBasisPoints(raw) : /^\d{1,3}$/.test(raw) ? Number(raw) : null;
      if (v === null) return type === "percent" ? "Percentages can have up to 2 decimals" : "Shares must be whole numbers";
      out[id] = v;
    }
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    if (type === "percent" && total !== 10000) return `Percentages add up to ${total / 100}%, not 100%`;
    if (type === "shares" && total === 0) return "Give at least one person a share";
    return { type, participants, weights: out };
  };

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const split = build();
      if (typeof split === "string") return setError(split);
      const r = await updateGroupSettingsAction(group.token, { name, baseCurrency, defaultSplit: split }, me ?? null);
      if (!r.ok) return setError(r.message);
      setSaved(true);
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Group name" htmlFor="g-name">
        <input id="g-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <Field label="Base currency" htmlFor="g-cur" hint={hasExpenses ? "Locked: the group already has expenses." : "Balances and settle-up use this currency."}>
        <select id="g-cur" className={inputClass} value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} disabled={hasExpenses}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Default split for new expenses</legend>
        <div role="radiogroup" aria-label="Default split type" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(["equal", "percent", "shares"] as Type[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${type === t ? "bg-card text-brand shadow" : "text-muted"}`}
            >
              {t === "equal" ? "Equally" : t === "percent" ? "%" : "Shares"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {active.map((m) => (
            <li key={m.id} className="flex min-h-14 items-center gap-3 px-3">
              <label className="flex min-h-11 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-teal-700"
                  checked={included.has(m.id)}
                  onChange={(e) =>
                    setIncluded((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(m.id);
                      else n.delete(m.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 truncate">{m.name}</span>
              </label>
              {type !== "equal" && included.has(m.id) && (
                <span className="flex items-center gap-1">
                  <input
                    aria-label={`${type === "percent" ? "Percent" : "Shares"} for ${m.name}`}
                    className={`${inputClass} w-20`}
                    inputMode="decimal"
                    value={weights[m.id] ?? ""}
                    onChange={(e) => setWeights((w) => ({ ...w, [m.id]: e.target.value }))}
                  />
                  {type === "percent" && <span aria-hidden="true">%</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="ok">Saved. New expenses will start with this split.</Notice>}
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
