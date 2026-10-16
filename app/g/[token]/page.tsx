import Link from "next/link";
import { PlusIcon, ReceiptIcon } from "@/app/_components/icons";
import { money } from "@/app/_lib/format";
import { readGroup } from "@/server/groups";
import { listExpenses } from "@/server/expenses";
import { listDraftReceipts } from "@/server/receipts";
import { BalanceSummary, ExpenseList } from "./expense-list";
import { ExpensesHeader } from "./expenses-header";

// Expenses tab (R8): your balance, receipts in progress (R36), the newest 50 expenses, and "+".
export default async function ExpensesPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  // readGroup first: it creates any due recurring expenses (R45) that the list must include.
  const view = await readGroup(token);
  const page = await listExpenses(token, 0);
  const drafts = await listDraftReceipts(view.group.id);
  const base = view.group.baseCurrency;
  return (
    <div className="flex flex-col gap-4">
      <BalanceSummary balances={view.balances} baseCurrency={base} expenseCount={view.expenseCount} />
      {drafts.length > 0 && (
        <section aria-labelledby="drafts">
          <h2 id="drafts" className="mb-2 text-lg font-bold">
            Receipts in progress
          </h2>
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/g/${token}/receipts/${d.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-brand bg-teal-50 px-4">
                  <ReceiptIcon className="h-6 w-6 text-brand" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.merchant ?? "Receipt"}</span>
                  <span className="text-sm font-semibold">{d.totalMinor > 0 ? money(d.totalMinor, d.currency) : "Tap your items"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ExpensesHeader token={token} />
      <ExpenseList initial={page.items} hasMore={page.hasMore} baseCurrency={base} />
      <Link
        href={`/g/${token}/add`}
        aria-label="Add expense or scan receipt"
        className="fixed bottom-24 right-[max(1rem,calc(50%-320px+1rem))] z-30 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg hover:bg-brand-dark"
      >
        <PlusIcon className="h-8 w-8" />
      </Link>
    </div>
  );
}
