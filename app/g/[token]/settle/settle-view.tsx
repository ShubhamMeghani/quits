"use client";

// Settle screen (R22–R26, R59): balances in words, naive/greedy/optimal counts, suggested payments
// with a QR-first UPI flow, "Mark as paid", manual payments, and recent payments.
import Link from "next/link";
import { useState, useTransition } from "react";
import { createSettlementAction, deleteSettlementAction } from "@/app/actions";
import { useIdentity } from "@/app/_components/identity";
import { UpiQr } from "@/app/_components/upi-qr";
import { Button, Card, Empty, Field, inputClass, Notice } from "@/app/_components/ui";
import { balanceWords, formatDate, money } from "@/app/_lib/format";
import { exponent } from "@/lib/currency";
import { minorToMajorString, parseMajorInput } from "@/lib/money";
import type { SettlePlan } from "@/lib/simplify";
import type { SettlementRow } from "@/server/context";

type Method = "upi" | "cash" | "other";

export function SettleView(props: {
  balances: Record<string, number>;
  plan: SettlePlan;
  naiveCount: number;
  baseCurrency: string;
  settlements: SettlementRow[];
  today: string;
}) {
  const { balances, plan, naiveCount, baseCurrency, settlements, today } = props;
  const { members, nameOf, me } = useIdentity();
  const sorted = [...members].filter((m) => !m.archived || balances[m.id] !== 0);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="balances">
        <h2 id="balances" className="mb-2 text-lg font-bold">
          Balances
        </h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {sorted.map((m) => {
            const b = balances[m.id] ?? 0;
            return (
              <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-4">
                <span className="min-w-0 truncate font-medium">{m.id === me ? `${m.name} (you)` : m.name}</span>
                <span className={`text-right text-sm font-semibold ${b > 0 ? "text-ok" : b < 0 ? "text-danger" : "text-muted"}`}>{balanceWords(b, baseCurrency)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="plan">
        <h2 id="plan" className="mb-2 text-lg font-bold">
          Suggested payments
        </h2>
        <Card className="mb-3">
          <p className="text-sm font-medium text-muted">Payments needed to settle everyone</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-teal-50 p-2">
              <dt className="text-xs font-semibold uppercase text-teal-900">Optimal</dt>
              <dd className="text-2xl font-bold text-teal-900">{plan.optimalCount ?? "—"}</dd>
            </div>
            <div className="rounded-xl bg-slate-100 p-2">
              <dt className="text-xs font-semibold uppercase text-muted">Greedy</dt>
              <dd className="text-2xl font-bold">{plan.greedyCount}</dd>
            </div>
            <div className="rounded-xl bg-slate-100 p-2">
              <dt className="text-xs font-semibold uppercase text-muted">Naive</dt>
              <dd className="text-2xl font-bold">{naiveCount}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-muted">
            {plan.algorithm === "optimal"
              ? "Showing the optimal plan: the exact minimum number of payments."
              : "Showing a greedy plan (approximate). Optimal: not computed (> 18 people)."}
            {plan.optimalCount !== null && plan.optimalCount < plan.greedyCount && ` That saves ${plan.greedyCount - plan.optimalCount} payment${plan.greedyCount - plan.optimalCount === 1 ? "" : "s"} over greedy.`}
          </p>
        </Card>
        {plan.payments.length === 0 ? (
          <Empty title="Everyone is settled up">No payments needed.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {plan.payments.map((p) => (
              <li key={`${p.from}-${p.to}-${p.amountMinor}`}>
                <SuggestionCard from={p.from} to={p.to} amountMinor={p.amountMinor} baseCurrency={baseCurrency} today={today} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ManualPayment baseCurrency={baseCurrency} today={today} />

      <section aria-labelledby="recent">
        <h2 id="recent" className="mb-2 text-lg font-bold">
          Recent payments
        </h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {settlements.map((s) => (
              <SettlementItem key={s.id} s={s} label={`${nameOf(s.fromMemberId)} paid ${s.toMemberId === me ? "you" : nameOf(s.toMemberId)}`} baseCurrency={baseCurrency} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SuggestionCard({ from, to, amountMinor, baseCurrency, today }: { from: string; to: string; amountMinor: number; baseCurrency: string; today: string }) {
  const { group, members, nameOf, me } = useIdentity();
  const payee = members.find((m) => m.id === to)!;
  const [marking, setMarking] = useState(false);
  const upiReady = baseCurrency === "INR" && !!payee.upiId;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 font-semibold">
          {nameOf(from)} {from === me ? "pay" : "pays"} {to === me ? "you" : nameOf(to)}
        </p>
        <p className="text-lg font-bold">{money(amountMinor, baseCurrency)}</p>
      </div>
      {baseCurrency === "INR" &&
        (upiReady ? (
          <UpiQr payee={{ name: payee.name, upiId: payee.upiId!, upiName: payee.upiName }} amountMinor={amountMinor} groupName={group.name} />
        ) : (
          <Link href={`/g/${group.token}/members/${to}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-border px-3 text-sm font-semibold text-brand">
            Add a UPI ID for {payee.name}
          </Link>
        ))}
      {marking ? (
        <MarkPaidForm from={from} to={to} amountMinor={amountMinor} baseCurrency={baseCurrency} today={today} upi={upiReady} onCancel={() => setMarking(false)} />
      ) : (
        <Button onClick={() => setMarking(true)}>Mark as paid</Button>
      )}
    </Card>
  );
}

function MarkPaidForm(props: { from: string; to: string; amountMinor: number; baseCurrency: string; today: string; upi: boolean; onCancel: () => void }) {
  const { group, me, nameOf } = useIdentity();
  const exp = exponent(props.baseCurrency);
  const [amount, setAmount] = useState(minorToMajorString(props.amountMinor, exp));
  const [method, setMethod] = useState<Method>(props.upi ? "upi" : "cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const amountMinor = parseMajorInput(amount, exp);

  const confirm = () =>
    start(async () => {
      setError(null);
      if (!amountMinor || amountMinor <= 0) return setError("Enter an amount more than 0");
      const r = await createSettlementAction(group.token, { fromMemberId: props.from, toMemberId: props.to, amountMinor, settledOn: props.today, method }, me ?? null);
      if (!r.ok) setError(r.message);
    });

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
    >
      <p className="font-medium">
        Record that {nameOf(props.from)} paid {props.to === me ? "you" : nameOf(props.to)}?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount" htmlFor={`mp-amt-${props.from}-${props.to}`}>
          <input id={`mp-amt-${props.from}-${props.to}`} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Paid with" htmlFor={`mp-m-${props.from}-${props.to}`}>
          <select id={`mp-m-${props.from}-${props.to}`} className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </div>
    </form>
  );
}

function ManualPayment({ baseCurrency, today }: { baseCurrency: string; today: string }) {
  const { group, members, me } = useIdentity();
  const active = members.filter((m) => !m.archived);
  const exp = exponent(baseCurrency);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(me ?? active[0]?.id ?? "");
  const [to, setTo] = useState(active.find((m) => m.id !== (me ?? active[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<Method>("upi");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Record a payment
      </Button>
    );
  }
  const submit = () =>
    start(async () => {
      setError(null);
      setDone(false);
      const amountMinor = parseMajorInput(amount, exp);
      if (!amountMinor || amountMinor <= 0) return setError("Enter an amount more than 0");
      if (from === to) return setError("Choose two different people");
      const r = await createSettlementAction(group.token, { fromMemberId: from, toMemberId: to, amountMinor, settledOn: date, method }, me ?? null);
      if (!r.ok) return setError(r.fields?.settledOn ?? r.message);
      setAmount("");
      setDone(true);
    });

  return (
    <section aria-labelledby="manual" className="rounded-2xl border border-border bg-card p-4">
      <h2 id="manual" className="mb-3 text-lg font-bold">
        Record a payment
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" htmlFor="mf">
            <select id="mf" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)}>
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To" htmlFor="mt">
            <select id="mt" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)}>
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Amount (${baseCurrency})`} htmlFor="ma">
            <input id="ma" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Date" htmlFor="md">
            <input id="md" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid with" htmlFor="mm">
            <select id="mm" className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {done && <Notice tone="ok">Payment recorded.</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Record"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function SettlementItem({ s, label, baseCurrency }: { s: SettlementRow; label: string; baseCurrency: string }) {
  const { group, me } = useIdentity();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const del = () =>
    start(async () => {
      const r = await deleteSettlementAction(group.token, s.id, me ?? null);
      if (!r.ok) setError(r.message);
    });
  return (
    <li className="flex flex-col gap-2 px-4 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          <p className="text-sm text-muted">
            {formatDate(s.settledOn)} · {s.method === "upi" ? "UPI" : s.method === "cash" ? "Cash" : "Other"}
          </p>
        </div>
        <p className="font-semibold">{money(s.amountMinor, baseCurrency)}</p>
        {!confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete payment: ${label}`}>
            Delete
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm">Delete this payment?</p>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            No
          </Button>
          <Button variant="danger" onClick={del} disabled={pending}>
            Delete
          </Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </li>
  );
}
