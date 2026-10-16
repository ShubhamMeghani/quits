"use client";

// R33: every value editable with live reconciliation; R34: tap who had each item (one phone,
// passed around); R35: finalize with the printed total; R36 (Should): drafts claimable elsewhere.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { finalizeReceiptAction, saveReceiptDraftAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { Button, Card, Field, inputBase, inputClass, Notice } from "@/app/_components/ui";
import { money } from "@/app/_lib/format";
import { exponent, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { minorToMajorString, parseMajorInput } from "@/lib/money";
import { allocateItemized, isMismatch, receiptDiff, type ReceiptData } from "@/lib/receipt";
import { CATEGORIES } from "@/lib/splits";
import type { ReceiptView } from "@/server/receipts";

type Item = { key: string; name: string; qty: string; amount: string; assignees: string[] };

let seq = 0;
const newKey = () => `n${++seq}`;

export function ReceiptEditor({ receipt, today }: { receipt: ReceiptView; today: string }) {
  const { group, members, me } = useIdentity();
  const router = useRouter();
  const people = members.filter((m) => !m.archived);
  const order = members.map((m) => m.id);
  const [currency, setCurrency] = useState(receipt.currency);
  const exp = exponent(currency);
  const fmt = (m: number) => minorToMajorString(m, exponent(receipt.currency));
  const [merchant, setMerchant] = useState(receipt.merchant ?? "");
  const [date, setDate] = useState(receipt.date ?? today);
  const [items, setItems] = useState<Item[]>(() =>
    receipt.items.map((i) => ({ key: i.id, name: i.name, qty: String(i.quantity), amount: fmt(i.amountMinor), assignees: i.assignees })),
  );
  const [extras, setExtras] = useState({
    tax: fmt(receipt.taxMinor),
    service: fmt(receipt.serviceMinor),
    tip: fmt(receipt.tipMinor),
    discount: fmt(receipt.discountMinor),
    roundOff: fmt(receipt.roundOffMinor),
    total: fmt(receipt.totalMinor),
  });
  const [description, setDescription] = useState(receipt.merchant ?? "Restaurant bill");
  const [category, setCategory] = useState<string>("Food & Drinks");
  const [payerId, setPayerId] = useState(me ?? people[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [badItem, setBadItem] = useState<number | null>(null);
  const [pending, start] = useTransition();

  if (receipt.status === "finalized") {
    return (
      <Card className="flex flex-col gap-3">
        <p>This receipt has already been added as an expense.</p>
        {receipt.expenseId && (
          <Link href={`/g/${group.token}/expenses/${receipt.expenseId}`} className="font-semibold text-brand">
            Open the expense
          </Link>
        )}
      </Card>
    );
  }

  const num = (s: string, allowNegative = false) => {
    const t = s.trim();
    if (!t) return 0;
    const v = parseMajorInput(t, exp);
    return v === null || (!allowNegative && v < 0) ? null : v;
  };
  const parsedItems = items.map((i) => ({ ...i, minor: num(i.amount), q: Number(i.qty || "1") }));
  const e = { tax: num(extras.tax), service: num(extras.service), tip: num(extras.tip), discount: num(extras.discount), roundOff: num(extras.roundOff, true), total: num(extras.total) };
  const invalidNumber = parsedItems.some((i) => i.minor === null || !(i.q > 0)) || Object.values(e).some((v) => v === null);

  const data: ReceiptData | null = invalidNumber
    ? null
    : {
        merchant: merchant || null,
        date,
        currency,
        items: parsedItems.map((i) => ({ name: i.name, quantity: i.q, amountMinor: i.minor! })),
        taxMinor: e.tax!,
        serviceMinor: e.service!,
        tipMinor: e.tip!,
        discountMinor: e.discount!,
        roundOffMinor: e.roundOff!,
        totalMinor: e.total!,
      };
  const diff = data ? receiptDiff(data) : 0;
  const mismatch = data ? isMismatch(diff, exp) : false;
  const computedTotal = data ? data.totalMinor - diff : 0;
  const alloc = data
    ? allocateItemized(parsedItems.map((i) => ({ amountMinor: i.minor!, assignees: i.assignees })), data.totalMinor, order)
    : null;

  const input = () => ({
    merchant: merchant.trim() || null,
    date,
    currency,
    items: parsedItems.map((i) => ({ name: i.name.trim(), quantity: i.q, amountMinor: i.minor!, assignees: i.assignees })),
    taxMinor: e.tax!,
    serviceMinor: e.service!,
    tipMinor: e.tip!,
    discountMinor: e.discount!,
    roundOffMinor: e.roundOff!,
    totalMinor: e.total!,
  });

  const updateItem = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const toggle = (key: string, memberId: string) =>
    setItems((xs) =>
      xs.map((x) => (x.key === key ? { ...x, assignees: x.assignees.includes(memberId) ? x.assignees.filter((a) => a !== memberId) : [...x.assignees, memberId] } : x)),
    );

  const saveDraft = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      if (invalidNumber) return setError("Check the highlighted amounts");
      const r = await saveReceiptDraftAction(group.token, receipt.id, input());
      if (!r.ok) return setError(r.message);
      setNotice("Draft saved. Others in the group can open it from the Expenses tab and tap their items.");
    });

  const finalize = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      setBadItem(null);
      if (invalidNumber) return setError("Check the highlighted amounts");
      if (alloc && !alloc.ok && alloc.error === "UNASSIGNED_ITEM") {
        setBadItem(alloc.itemIndex);
        return setError(`Choose who had "${items[alloc.itemIndex].name || `item ${alloc.itemIndex + 1}`}"`);
      }
      if (alloc && !alloc.ok) return setError("Add at least one item with an amount");
      const r = await finalizeReceiptAction(group.token, receipt.id, { receipt: input(), description, category: category as (typeof CATEGORIES)[number], expenseDate: date, payerId }, me ?? null);
      if (!r.ok) return setError(r.message);
      router.push(`/g/${group.token}/expenses/${r.data.expenseId}`);
    });

  const moneyInput = (label: string, key: keyof typeof extras, opts: { negative?: boolean } = {}) => (
    <Field label={label} htmlFor={`x-${key}`}>
      <input
        id={`x-${key}`}
        className={inputClass}
        aria-invalid={num(extras[key], opts.negative) === null}
        inputMode="decimal"
        value={extras[key]}
        onChange={(ev) => setExtras((x) => ({ ...x, [key]: ev.target.value }))}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      {receipt.model && <p className="text-sm text-muted">Read by {receipt.model}. Check every value — you can edit all of them.</p>}

      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <Field label="Merchant" htmlFor="r-merchant">
          <input id="r-merchant" className={inputClass} value={merchant} onChange={(ev) => setMerchant(ev.target.value)} maxLength={100} />
        </Field>
        <Field label="Currency" htmlFor="r-cur">
          <select id="r-cur" className={inputClass} value={currency} onChange={(ev) => setCurrency(ev.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code}>{c.code}</option>
            ))}
          </select>
        </Field>
      </div>

      <section aria-labelledby="items-h" className="flex flex-col gap-2">
        <h2 id="items-h" className="text-lg font-bold">
          Items — tap who had each one
        </h2>
        {items.length === 0 && <p className="text-sm text-muted">No items yet. Add them below.</p>}
        <ol className="flex flex-col gap-3">
          {parsedItems.map((it, idx) => (
            <li key={it.key} className={`flex flex-col gap-2 rounded-2xl border bg-card p-3 ${badItem === idx || (it.assignees.length === 0 && badItem !== null) ? "border-danger" : "border-border"}`}>
              <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_6.5rem] gap-2">
                <input aria-label={`Item ${idx + 1} name`} className={inputClass} value={it.name} onChange={(ev) => updateItem(it.key, { name: ev.target.value })} maxLength={100} />
                <input aria-label={`Item ${idx + 1} quantity`} className={`${inputBase} w-full px-1 text-center`} aria-invalid={!(it.q > 0)} inputMode="decimal" value={it.qty} onChange={(ev) => updateItem(it.key, { qty: ev.target.value })} />
                <input aria-label={`Item ${idx + 1} amount`} className={inputClass} aria-invalid={it.minor === null} inputMode="decimal" value={it.amount} onChange={(ev) => updateItem(it.key, { amount: ev.target.value })} />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Who had ${it.name || `item ${idx + 1}`}`}>
                {people.map((m) => {
                  const on = it.assignees.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(it.key, m.id)}
                      className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${on ? "border-brand bg-brand text-brand-fg" : "border-border bg-card text-foreground"}`}
                    >
                      {m.id === me ? `${m.name} (you)` : m.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateItem(it.key, { assignees: it.assignees.length === people.length ? [] : people.map((m) => m.id) })}
                  className="min-h-11 rounded-full border border-dashed border-border px-4 text-sm font-semibold text-brand"
                >
                  {it.assignees.length === people.length ? "Clear" : "Everyone"}
                </button>
                <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} className="ml-auto min-h-11 rounded-full px-3 text-sm font-semibold text-danger" aria-label={`Remove item ${idx + 1}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" onClick={() => setItems((xs) => [...xs, { key: newKey(), name: "", qty: "1", amount: "", assignees: [] }])}>
          + Add item
        </Button>
      </section>

      <section aria-labelledby="extras-h" className="flex flex-col gap-3">
        <h2 id="extras-h" className="text-lg font-bold">
          Tax, charges and total
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {moneyInput("Tax (CGST + SGST…)", "tax")}
          {moneyInput("Service charge", "service")}
          {moneyInput("Tip", "tip")}
          {moneyInput("Discount", "discount")}
          {moneyInput("Round-off (+/−)", "roundOff", { negative: true })}
          {moneyInput("Printed total", "total")}
        </div>
        {data &&
          (mismatch ? (
            <Notice tone="warn">
              <p className="font-semibold">Total mismatch: {money(diff > 0 ? diff : -diff, currency)} {diff > 0 ? "more than" : "less than"} items + charges.</p>
              <p>Check the values. The expense will use the printed total, and the difference is shared like tax.</p>
              <button type="button" className="mt-1 min-h-11 font-semibold underline" onClick={() => setExtras((x) => ({ ...x, total: minorToMajorString(computedTotal, exp) }))}>
                Set printed total to {money(computedTotal, currency)}
              </button>
            </Notice>
          ) : (
            <Notice tone="ok">✓ Items, tax and charges add up to the printed total (within {money(10 ** exp, currency)}).</Notice>
          ))}
      </section>

      {alloc?.ok && (
        <section aria-labelledby="who-h">
          <h2 id="who-h" className="mb-2 text-lg font-bold">
            Each person pays
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {people
              .filter((m) => (alloc.owed[m.id] ?? 0) !== 0)
              .map((m) => (
                <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-4">
                  <span>{m.name}</span>
                  <span className="text-right">
                    <span className="font-semibold">{money(alloc.owed[m.id], currency)}</span>
                    <span className="block text-xs text-muted">
                      items {money(alloc.itemShares[m.id], currency)} + share of tax/charges {money(alloc.remainderShares[m.id], currency)}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="exp-h" className="flex flex-col gap-3">
        <h2 id="exp-h" className="text-lg font-bold">
          Add as expense
        </h2>
        <Field label="Description" htmlFor="r-desc">
          <input id="r-desc" className={inputClass} value={description} onChange={(ev) => setDescription(ev.target.value)} maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by" htmlFor="r-payer">
            <select id="r-payer" className={inputClass} value={payerId} onChange={(ev) => setPayerId(ev.target.value)}>
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === me ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="r-date">
            <input id="r-date" type="date" className={inputClass} value={date} onChange={(ev) => setDate(ev.target.value)} />
          </Field>
        </div>
        <Field label="Category" htmlFor="r-cat">
          <select id="r-cat" className={inputClass} value={category} onChange={(ev) => setCategory(ev.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={saveDraft} disabled={pending}>
          Save draft
        </Button>
        <Button onClick={finalize} disabled={pending || !data}>
          {pending ? "Saving…" : "Add expense"}
        </Button>
      </div>
      <Button variant="ghost" onClick={() => router.refresh()}>
        Refresh (see items others claimed)
      </Button>
    </div>
  );
}
