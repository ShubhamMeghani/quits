"use client";

// Add/edit expense (R8–R10): four split types with live per-person preview and difference,
// default-split prefill, single payer by default and multiple payers (Should).
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createExpenseAction, updateExpenseAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Field, inputClass, Notice, textareaClass } from "@/app/_components/ui";
import { money } from "@/app/_lib/format";
import { exponent, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { minorToMajorString, parseMajorInput } from "@/lib/money";
import { CATEGORIES, computePayers, computeSplit, percentToBasisPoints, splitErrorMessage, type SplitInput } from "@/lib/splits";
import type { ExpenseRow } from "@/server/context";
import type { DefaultSplit, ExpenseInput } from "@/server/schemas";
import { PayerRows, SplitRows } from "./split-rows";
import { flagMessage, TypeIt } from "./type-it";
import type { NlFlag, NlResult } from "@/lib/nlparse";

type EditableSplit = "equal" | "exact" | "percent" | "shares";

const SPLIT_LABELS: Record<EditableSplit, string> = { equal: "Equally", exact: "Exact", percent: "%", shares: "Shares" };

type Props = {
  baseCurrency: string;
  defaultSplit: DefaultSplit | null;
  today: string;
  initial?: ExpenseRow;
};

function bpsToPercent(bps: number): string {
  return minorToMajorString(bps, 2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function ExpenseForm({ baseCurrency, defaultSplit, today, initial }: Props) {
  const { group, members, me } = useIdentity();
  const router = useRouter();
  const [pending, start] = useTransition();

  // Active members, plus any archived member already on this expense.
  const people = useMemo(() => {
    const onExpense = new Set([...(initial?.payers.map((p) => p.memberId) ?? []), ...(initial?.splits.map((s) => s.memberId) ?? [])]);
    return members.filter((m) => !m.archived || onExpense.has(m.id));
  }, [members, initial]);
  const order = people.map((m) => m.id);

  const [currency, setCurrency] = useState(initial?.currency ?? baseCurrency);
  const exp = exponent(currency);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? minorToMajorString(initial.amountMinor, exponent(initial.currency)) : "");
  const [date, setDate] = useState(initial?.expenseDate ?? today);
  const [category, setCategory] = useState<string>(initial?.category ?? "Other");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [manualRate, setManualRate] = useState("");
  const [needsRate, setNeedsRate] = useState(false);
  const [repeat, setRepeat] = useState<"none" | "weekly" | "monthly">("none");
  const [repeatEnd, setRepeatEnd] = useState("");

  const [multiPayer, setMultiPayer] = useState((initial?.payers.length ?? 1) > 1);
  const [payerId, setPayerId] = useState(initial?.payers[0]?.memberId ?? me ?? order[0]);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.payers ?? []).map((p) => [p.memberId, minorToMajorString(p.amountMinor, exponent(initial!.currency))])),
  );

  const initType: EditableSplit =
    initial && initial.splitType !== "itemized" ? initial.splitType : !initial && defaultSplit ? defaultSplit.type : "equal";
  const [splitType, setSplitType] = useState<EditableSplit>(initType);
  const [included, setIncluded] = useState<Set<string>>(() => {
    if (initial) return new Set(initial.splits.map((s) => s.memberId));
    if (defaultSplit) return new Set(defaultSplit.participants.filter((id) => order.includes(id)));
    return new Set(people.filter((m) => !m.archived).map((m) => m.id));
  });
  const [exact, setExact] = useState<Record<string, string>>(() =>
    initial?.splitType === "exact" ? Object.fromEntries(initial.splits.map((s) => [s.memberId, minorToMajorString(s.owedMinor, exponent(initial.currency))])) : {},
  );
  const [percent, setPercent] = useState<Record<string, string>>(() => {
    if (initial?.splitType === "percent") return Object.fromEntries(initial.splits.map((s) => [s.memberId, bpsToPercent(s.inputValue ?? 0)]));
    if (!initial && defaultSplit?.type === "percent") return Object.fromEntries(Object.entries(defaultSplit.weights).map(([k, v]) => [k, bpsToPercent(v)]));
    return {};
  });
  const [shares, setShares] = useState<Record<string, string>>(() => {
    if (initial?.splitType === "shares") return Object.fromEntries(initial.splits.map((s) => [s.memberId, String(s.inputValue ?? 0)]));
    if (!initial && defaultSplit?.type === "shares") return Object.fromEntries(Object.entries(defaultSplit.weights).map(([k, v]) => [k, String(v)]));
    return Object.fromEntries(order.map((id) => [id, "1"]));
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nlFlags, setNlFlags] = useState<NlFlag[]>([]);

  // R61/R64: type-to-add only fills the form; blank or ambiguous fields stay highlighted.
  const applyPrefill = ({ prefill: p, flags }: NlResult) => {
    if (p.description) setDescription(p.description);
    setCurrency(p.currency);
    setAmount(p.amountMinor !== null ? minorToMajorString(p.amountMinor, exponent(p.currency)) : "");
    setMultiPayer(false);
    setPayerId(p.payerId ?? "");
    setSplitType(p.splitType);
    if (p.participantIds.length) setIncluded(new Set(p.participantIds));
    if (p.splitType === "exact") setExact(p.splitValues ?? {});
    if (p.splitType === "percent") setPercent(p.splitValues ?? {});
    if (p.splitType === "shares") setShares(p.splitValues ?? Object.fromEntries(order.map((id) => [id, ""])));
    if (p.category) setCategory(p.category);
    if (p.date) setDate(p.date);
    setNlFlags(flags);
  };
  const flagged = (field: NlFlag["field"]) => nlFlags.some((x) => x.field === field);

  const amountMinor = parseMajorInput(amount, exp);

  const split: SplitInput | { invalid: string } = (() => {
    switch (splitType) {
      case "equal":
        return { type: "equal", participants: order.filter((id) => included.has(id)) };
      case "exact": {
        const amounts: Record<string, number> = {};
        for (const id of order) {
          const v = (exact[id] ?? "").trim();
          if (!v) continue;
          const m = parseMajorInput(v, exp);
          if (m === null || m < 0) return { invalid: "Check the amounts" };
          amounts[id] = m;
        }
        return { type: "exact", amounts };
      }
      case "percent": {
        const bp: Record<string, number> = {};
        for (const id of order) {
          const v = (percent[id] ?? "").trim();
          if (!v) continue;
          const b = percentToBasisPoints(v);
          if (b === null) return { invalid: "Percentages can have up to 2 decimals" };
          bp[id] = b;
        }
        return { type: "percent", basisPoints: bp };
      }
      case "shares": {
        const sh: Record<string, number> = {};
        for (const id of order) {
          const v = (shares[id] ?? "").trim();
          if (!v) continue;
          if (!/^\d{1,3}$/.test(v)) return { invalid: "Shares must be whole numbers" };
          sh[id] = Number(v);
        }
        return { type: "shares", shares: sh };
      }
    }
  })();

  const payers: Record<string, number> | { invalid: string } = (() => {
    if (!multiPayer) return amountMinor ? { [payerId]: amountMinor } : {};
    const out: Record<string, number> = {};
    for (const id of order) {
      const v = (payerAmounts[id] ?? "").trim();
      if (!v) continue;
      const m = parseMajorInput(v, exp);
      if (m === null || m < 0) return { invalid: "Check the payer amounts" };
      out[id] = m;
    }
    return out;
  })();

  const preview = (() => {
    if (!amountMinor || amountMinor <= 0) return { owed: {} as Record<string, number>, message: null as string | null, ok: false };
    if ("invalid" in split) return { owed: {}, message: split.invalid, ok: false };
    const r = computeSplit(amountMinor, split, order);
    if (!r.ok) return { owed: {}, message: splitErrorMessage(r.error, currency), ok: false };
    return { owed: Object.fromEntries(r.value.map((s) => [s.memberId, s.owedMinor])), message: null, ok: true };
  })();

  const payerMessage = (() => {
    if (!amountMinor || !multiPayer) return null;
    if ("invalid" in payers) return payers.invalid;
    const r = computePayers(amountMinor, payers, order);
    return r.ok ? null : splitErrorMessage(r.error, currency);
  })();

  const canSave = !!description.trim() && !!amountMinor && amountMinor > 0 && preview.ok && !payerMessage && (multiPayer || payerId !== "") && !pending;

  const submit = () =>
    start(async () => {
      setError(null);
      setFieldErrors({});
      if (!canSave || "invalid" in split || "invalid" in payers) return;
      const input: ExpenseInput = {
        description: description.trim(),
        category: category as ExpenseInput["category"],
        notes: notes.trim() || null,
        expenseDate: date,
        currency,
        amountMinor: amountMinor!,
        payers,
        split: split as ExpenseInput["split"],
        manualRate: needsRate && manualRate.trim() ? manualRate.trim() : null,
      };
      const r = initial ? await updateExpenseAction(group.token, initial.id, input, me ?? null) : await createExpenseAction(group.token, input, me ?? null, repeat === "none" ? null : { frequency: repeat, endDate: repeatEnd || null });
      if (!r.ok) {
        if (r.code === "RATE_UNAVAILABLE") setNeedsRate(true);
        setFieldErrors(r.fields ?? {});
        return setError(r.message);
      }
      router.push(initial ? `/g/${group.token}/expenses/${initial.id}` : `/g/${group.token}`);
    });

  const setMap = (setter: React.Dispatch<React.SetStateAction<Record<string, string>>>, id: string, v: string) => setter((m) => ({ ...m, [id]: v }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      {!initial && <TypeIt token={group.token} me={me ?? null} onFill={applyPrefill} />}
      {nlFlags.length > 0 && (
        <Notice tone="warn">
          <ul className="list-disc pl-4">
            {[...new Set(nlFlags.map((x) => flagMessage(x, baseCurrency)))].map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </Notice>
      )}
      <Field label="Description" htmlFor="desc" error={fieldErrors.description}>
        <input id="desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={100} placeholder="e.g. Swiggy dinner" autoFocus={!initial} />
      </Field>

      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <Field label="Amount" htmlFor="amount" error={fieldErrors.amountMinor}>
          <input
            id="amount"
            className={`${inputClass} text-lg font-semibold`}
            aria-invalid={flagged("amount") && !amountMinor}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <select id="currency" className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {currency !== baseCurrency && (
        <p className="-mt-2 text-sm text-muted">Converted to {baseCurrency} at the rate on the expense date.</p>
      )}
      {needsRate && currency !== baseCurrency && (
        <Field label={`Exchange rate: 1 ${currency} = ? ${baseCurrency}`} htmlFor="rate" hint="We couldn't fetch the rate. Enter it to continue.">
          <input id="rate" className={inputClass} value={manualRate} onChange={(e) => setManualRate(e.target.value)} inputMode="decimal" placeholder="e.g. 83.45" />
        </Field>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Paid by</legend>
        {!multiPayer ? (
          <select aria-label="Paid by" className={inputClass} aria-invalid={payerId === ""} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {payerId === "" && (
              <option value="" disabled>
                Choose who paid
              </option>
            )}
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
        ) : (
          <PayerRows people={people} me={me} amounts={payerAmounts} onValue={(id, v) => setMap(setPayerAmounts, id, v)} />
        )}
        {payerMessage && <p className="text-sm font-medium text-danger">{payerMessage}</p>}
        <button type="button" className="min-h-11 self-start text-sm font-semibold text-brand" onClick={() => setMultiPayer((v) => !v)}>
          {multiPayer ? "Only one person paid" : "Multiple people paid"}
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Split</legend>
        <div role="radiogroup" aria-label="Split type" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          {(Object.keys(SPLIT_LABELS) as EditableSplit[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={splitType === t}
              onClick={() => setSplitType(t)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${splitType === t ? "bg-card text-brand shadow" : "text-muted"}`}
            >
              {SPLIT_LABELS[t]}
            </button>
          ))}
        </div>
        <SplitRows
          people={people}
          me={me}
          mode={splitType}
          included={included}
          exact={exact}
          percent={percent}
          shares={shares}
          owed={Object.fromEntries(Object.entries(preview.owed).map(([id, v]) => [id, money(v, currency)]))}
          onToggle={(id, checked) =>
            setIncluded((st) => {
              const n = new Set(st);
              if (checked) n.add(id);
              else n.delete(id);
              return n;
            })
          }
          onValue={(mode, id, v) => setMap(mode === "exact" ? setExact : mode === "percent" ? setPercent : setShares, id, v)}
        />
        <p className={`text-sm font-medium ${!amountMinor ? "text-muted" : preview.ok ? "text-ok" : "text-danger"}`} aria-live="polite">
          {!amountMinor ? "Enter an amount to see each share." : preview.ok ? "✓ Adds up" : preview.message}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="date" error={fieldErrors.expenseDate}>
          <input id="date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} max="2100-12-31" />
        </Field>
        <Field label="Category" htmlFor="category">
          <select id="category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {!initial && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeat" htmlFor="repeat">
            <select id="repeat" className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              <option value="none">Doesn&apos;t repeat</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </Field>
          {repeat !== "none" && (
            <Field label="Until (optional)" htmlFor="repeat-end">
              <input id="repeat-end" type="date" className={inputClass} value={repeatEnd} min={date} onChange={(e) => setRepeatEnd(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      <Field label="Notes (optional)" htmlFor="notes">
        <textarea id="notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={!canSave}>
        {pending ? "Saving…" : initial ? "Save changes" : "Add expense"}
      </Button>
    </form>
  );
}
