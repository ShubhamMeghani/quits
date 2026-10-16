import { money } from "@/app/_lib/format";
import { exponent } from "@/lib/currency";
import { allocateItemized, isMismatch } from "@/lib/receipt";
import type { ReceiptView } from "@/server/receipts";

/** R35: per-item breakdown of an itemized expense, with the mismatch badge when |diff| > ₹1. */
export function ReceiptBreakdown({ receipt, names, order }: { receipt: ReceiptView; names: Map<string, string>; order: string[] }) {
  const cur = receipt.currency;
  const alloc = allocateItemized(
    receipt.items.map((i) => ({ amountMinor: i.amountMinor, assignees: i.assignees })),
    receipt.totalMinor,
    order,
  );
  const mismatch = isMismatch(receipt.diffMinor, exponent(cur));
  const extras: [string, number][] = (
    [
      ["Tax", receipt.taxMinor],
      ["Service charge", receipt.serviceMinor],
      ["Tip", receipt.tipMinor],
      ["Discount", -receipt.discountMinor],
      ["Round-off", receipt.roundOffMinor],
    ] as [string, number][]
  ).filter(([, v]) => v !== 0);

  return (
    <section aria-labelledby="receipt-h" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="receipt-h" className="font-bold">
          Receipt{receipt.merchant ? ` · ${receipt.merchant}` : ""}
        </h2>
        {mismatch && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            Total mismatch {money(Math.abs(receipt.diffMinor), cur)}
          </span>
        )}
      </div>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {receipt.items.map((i) => (
          <li key={i.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0">
              <span className="block truncate">
                {i.name}
                {i.quantity !== 1 && <span className="text-muted"> × {i.quantity}</span>}
              </span>
              <span className="block truncate text-xs text-muted">{i.assignees.map((a) => names.get(a) ?? "?").join(", ")}</span>
            </span>
            <span className="font-semibold">{money(i.amountMinor, cur)}</span>
          </li>
        ))}
        {extras.map(([label, v]) => (
          <li key={label} className="flex min-h-10 items-center justify-between px-4 text-sm text-muted">
            <span>{label}</span>
            <span>{v < 0 ? `−${money(-v, cur)}` : money(v, cur)}</span>
          </li>
        ))}
        <li className="flex min-h-12 items-center justify-between px-4 font-bold">
          <span>Printed total</span>
          <span>{money(receipt.totalMinor, cur)}</span>
        </li>
      </ul>
      {alloc.ok && (
        <p className="text-sm text-muted">
          Tax, charges{mismatch ? " and the unexplained difference" : ""} ({money(alloc.remainderMinor, cur)}) are shared in proportion to what each person ordered.
        </p>
      )}
    </section>
  );
}
