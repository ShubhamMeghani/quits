import type { Metadata } from "next";
import Link from "next/link";
import results from "@/eval/results.json";
import receiptRun1 from "@/eval/results-run1.json";
import receiptRun2 from "@/eval/results-run2.json";
import nlResults from "@/eval/nl/results.json";
import nlRun1 from "@/eval/nl/results-run1.json";
import nlRun2 from "@/eval/nl/results-run2.json";
import { Card, Notice } from "@/app/_components/ui";
import { answeredSummary, type NlAnsweredRow } from "@/lib/nlparse";
import { answeredReceiptSummary } from "@/lib/receipt";

export const metadata: Metadata = { title: "About — Quits" };

type Row = { id: string; predictedItems: number; truthItems: number; matched: number; totalCorrect: boolean; reconciled: boolean; latencySec: number; error: boolean };
type ReceiptRun = {
  status: "ok";
  run?: number;
  blindness?: string;
  dataset: string;
  model: string;
  runAt: string;
  n: number;
  precision: number;
  recall: number;
  f1: number;
  totalAccuracy: number;
  reconciliationRate: number;
  meanLatencySec: number;
  perReceipt: Row[];
};
type Results = { status: "not-run"; dataset: string; note: string } | ReceiptRun;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type NlResults =
  | { status: "not-run"; note: string }
  | {
      status: "ok";
      model: string;
      runAt: string;
      n: number;
      ambiguousN: number;
      amountAccuracy: number;
      payerAccuracy: number;
      participantsAccuracy: number;
      splitTypeAccuracy: number;
      exactMatchRate: number;
      abstentionRate: number;
      meanLatencySec: number;
      perSentence: NlAnsweredRow[];
    };

/** R66: the committed type-to-add eval results, next to the receipt eval (no live call). */
function NlEvalSection() {
  const r = nlResults as unknown as NlResults;
  const run1 = nlRun1 as unknown as Extract<NlResults, { status: "ok" }>;
  const run2 = nlRun2 as unknown as Extract<NlResults, { status: "ok" }>;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="nl-eval-h">
      <h2 id="nl-eval-h" className="text-xl font-bold">
        Type-to-add accuracy
      </h2>
      {r.status !== "ok" ? (
        <Notice tone="warn">
          <p className="font-semibold">Evaluation not run yet.</p>
          <p>{r.note}</p>
        </Notice>
      ) : (
        <>
          <p className="text-sm text-muted">
            {r.n} sentences ({r.ambiguousN} deliberately ambiguous) · model <code>{r.model}</code> · run {r.runAt.slice(0, 10)}
          </p>
          {(() => {
            const a = answeredSummary(r.perSentence);
            return (
              <>
                <Card className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted">Answer rate</p>
                  <p className="text-2xl font-bold">{pct(a.answerRate)}</p>
                  <p className="text-sm text-muted">
                    {a.answered} of {a.n} sentences got an answer within 20 s
                  </p>
                </Card>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["Amount", r.amountAccuracy, a.amountAccuracy],
                      ["Payer", r.payerAccuracy, a.payerAccuracy],
                      ["Who shares", r.participantsAccuracy, a.participantsAccuracy],
                      ["Split type", r.splitTypeAccuracy, a.splitTypeAccuracy],
                      ["Exact match", r.exactMatchRate, a.exactMatchRate],
                      ["Correctly left blank", r.abstentionRate, a.abstentionRate],
                    ] as const
                  ).map(([k, overall, answered]) => (
                    <Card key={k} className="p-3">
                      <p className="text-xs font-semibold uppercase text-muted">{k}</p>
                      <p className="text-2xl font-bold">{pct(overall)}</p>
                      <p className="text-sm text-muted">{pct(answered)} when answered</p>
                    </Card>
                  ))}
                </div>
              </>
            );
          })()}
          <p className="text-sm">
            Run 3 gives Gemini up to 20 s and waits before its one retry. It is not blind for two fixes chosen after earlier runs.{" "}
            <a href="#nl-earlier" className="font-semibold text-brand underline">
              Earlier runs
            </a>
          </p>
        </>
      )}
      <details id="nl-earlier" className="rounded-2xl border border-border bg-card p-3 text-sm">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Earlier runs (kept as they were)</summary>
        {(
          [
            ["Run 2", run2, "Through the app's own handler with one retry and a 15 s limit; three sentences got no answer."],
            ["Run 1", run1, "Called Gemini without the app's retry; four sentences got no answer (two timeouts, two server errors)."],
          ] as const
        ).map(([label, run, note]) => {
          const a = answeredSummary(run.perSentence);
          return (
            <div key={label} className="mt-2">
              <p className="font-semibold">
                {label} · {run.n} sentences · {run.runAt.slice(0, 10)}
              </p>
              <p className="mt-1">
                Answer rate: <span className="font-semibold">{pct(a.answerRate)}</span> ({a.answered} of {a.n})
              </p>
              <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(
                  [
                    ["Amount", run.amountAccuracy, a.amountAccuracy],
                    ["Payer", run.payerAccuracy, a.payerAccuracy],
                    ["Who shares", run.participantsAccuracy, a.participantsAccuracy],
                    ["Split type", run.splitTypeAccuracy, a.splitTypeAccuracy],
                    ["Exact match", run.exactMatchRate, a.exactMatchRate],
                    ["Correctly left blank", run.abstentionRate, a.abstentionRate],
                  ] as const
                ).map(([k, overall, answered]) => (
                  <li key={k}>
                    {k}: <span className="font-semibold">{pct(overall)}</span> <span className="text-muted">({pct(answered)} when answered)</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted">{note}</p>
            </div>
          );
        })}
      </details>
      <p className="text-sm text-muted">
        Method: about 30 English and Hinglish sentences with hand-checked answers, about 5 of them deliberately unclear (for example two people with the same name). A
        field counts as correct only if it matches exactly. “Exact match” needs the amount, the payer and the set of people right, and the split must give everyone the same amount (an equal split and 1:1 shares count as the same). “Correctly left blank”
        is the share of unclear sentences where Quits left the unclear field empty instead of guessing. “Answer rate” is the share of sentences that got an answer within the
        time limit; the big figures count a sentence with no answer as wrong, and “when answered” counts only the sentences that got an answer.
      </p>
    </section>
  );
}

// R38: shows the committed eval/results.json — no live Gemini call.
export default function AboutPage() {
  const r = results as unknown as Results;
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Link href="/" className="inline-flex min-h-11 items-center self-start font-semibold text-brand">
          ← Quits
        </Link>
        <h1 className="text-3xl font-bold">About Quits</h1>
        <p className="text-muted">A free, mobile-first bill splitter for students. Course project, Applied Data Science &amp; AI, IISc.</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">How it works</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <span className="font-semibold">Exact money.</span> Amounts are stored as whole paise. Rounding leftovers go to the people with the largest remainders, so every
            group&apos;s balances add up to exactly zero.
          </li>
          <li>
            <span className="font-semibold">Fewest payments, with proof.</span> Settle-up finds the exact minimum number of payments (number of people who owe or are owed,
            minus the most disjoint groups that cancel out), using dynamic programming over subsets for up to 18 people. It shows how that compares with the greedy and
            naive approaches.
          </li>
          <li>
            <span className="font-semibold">UPI QR settle-up.</span> Each payment has a UPI QR code with the payee and amount filled in. Scan it from another screen, a
            friend&apos;s phone, or a saved image. Quits never handles money: a payment counts only when you tap “Mark as paid”.
          </li>
          <li>
            <span className="font-semibold">Itemized receipts.</span> A receipt photo is read by Google Gemini. Every value can be corrected, each person taps what they had,
            and tax and service charge are shared in proportion. If the items don&apos;t add up to the printed total, Quits flags it.
          </li>
          <li>
            <span className="font-semibold">Privacy.</span> No accounts: anyone with a group&apos;s link can view and edit it. Receipt photos are sent to Gemini to be read and
            are not stored by Quits.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="eval-h">
        <h2 id="eval-h" className="text-xl font-bold">
          Receipt-reading accuracy
        </h2>
        {r.status !== "ok" ? (
          <Notice tone="warn">
            <p className="font-semibold">Evaluation not run yet.</p>
            <p>{r.note}</p>
          </Notice>
        ) : (
          <>
            <p className="text-sm text-muted">
              {r.dataset} · <span className="font-semibold">n = {r.n}, small sample</span> · model <code>{r.model}</code> · run {r.runAt.slice(0, 10)}
            </p>
            {(() => {
              const a = answeredReceiptSummary(r.perReceipt);
              return (
                <>
                  <Card className="p-3">
                    <p className="text-xs font-semibold uppercase text-muted">Answer rate</p>
                    <p className="text-2xl font-bold">{pct(a.answerRate)}</p>
                    <p className="text-sm text-muted">
                      {a.answered} of {a.n} receipts got an answer within 25 s · mean {r.meanLatencySec.toFixed(1)} s
                    </p>
                  </Card>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["Item precision", r.precision, a.precision],
                        ["Item recall", r.recall, a.recall],
                        ["Item F1", r.f1, a.f1],
                        ["Total accuracy", r.totalAccuracy, a.totalAccuracy],
                        ["Reconciliation rate", r.reconciliationRate, a.reconciliationRate],
                      ] as const
                    ).map(([k, overall, answered]) => (
                      <Card key={k} className="p-3">
                        <p className="text-xs font-semibold uppercase text-muted">{k}</p>
                        <p className="text-2xl font-bold">{pct(overall)}</p>
                        <p className="text-sm text-muted">{pct(answered)} when answered</p>
                      </Card>
                    ))}
                  </div>
                </>
              );
            })()}
            {r.blindness && (
              <p className="text-sm">
                Run {r.run}: {r.blindness}{" "}
                <a href="#receipt-earlier" className="font-semibold text-brand underline">
                  Earlier runs
                </a>
              </p>
            )}
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-3 py-2">Receipt</th>
                    <th className="px-3 py-2">Items (pred / true / matched)</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Reconciled</th>
                  </tr>
                </thead>
                <tbody>
                  {r.perReceipt.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">{row.id}</td>
                      <td className="px-3 py-2">
                        {row.predictedItems} / {row.truthItems} / {row.matched}
                      </td>
                      <td className="px-3 py-2">{row.error ? "no answer" : row.totalCorrect ? "correct" : "wrong"}</td>
                      <td className="px-3 py-2">{row.error ? "—" : row.reconciled ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details id="receipt-earlier" className="rounded-2xl border border-border bg-card p-3 text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">Earlier runs (kept as they were)</summary>
              {(
                [
                  ["Run 2", receiptRun2 as unknown as ReceiptRun, "Same prompt as run 1; first run that saved what Gemini read. One receipt got no answer."],
                  ["Run 1", receiptRun1 as unknown as ReceiptRun, "Same receipts, prompt and model; it did not save what Gemini read, so its misses can't be explained."],
                ] as const
              ).map(([label, run, note]) => {
                const a = answeredReceiptSummary(run.perReceipt);
                return (
                  <div key={label} className="mt-2">
                    <p className="font-semibold">
                      {label} · n = {run.n}, small sample · {run.runAt.slice(0, 10)}
                    </p>
                    <p className="mt-1">
                      Answer rate: <span className="font-semibold">{pct(a.answerRate)}</span> ({a.answered} of {a.n})
                    </p>
                    <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {(
                        [
                          ["Item precision", run.precision, a.precision],
                          ["Item recall", run.recall, a.recall],
                          ["Item F1", run.f1, a.f1],
                          ["Total accuracy", run.totalAccuracy, a.totalAccuracy],
                          ["Reconciliation rate", run.reconciliationRate, a.reconciliationRate],
                        ] as const
                      ).map(([k, overall, answered]) => (
                        <li key={k}>
                          {k}: <span className="font-semibold">{pct(overall)}</span> <span className="text-muted">({pct(answered)} when answered)</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted">{note}</p>
                  </div>
                );
              })}
            </details>
          </>
        )}
        <p className="text-sm text-muted">
          Method: 5 real receipts (n = 5, small sample: one receipt moves a per-receipt rate by 20 points): three restaurant bills and two food-delivery
          screenshots, with ground truth checked by hand against the paper bills. An item counts as correct when its amount is within ₹1 and its name is at least 60%
          similar. Precision, recall and F1 are averaged over all items. “Total accuracy” means the total was read within ₹1. “Reconciled” means the items, tax and charges
          add up to the total within ₹1. “Answer rate” is the share of receipts Gemini read within 25 s; the big figures count a receipt with no answer as all items missed,
          and “when answered” counts only the receipts that got an answer.
        </p>
      </section>

      <NlEvalSection />
    </main>
  );
}
