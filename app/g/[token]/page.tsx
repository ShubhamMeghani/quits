import Link from "next/link";
import { PlusIcon } from "@/app/_components/icons";
import { readGroup } from "@/server/groups";
import { listExpenses } from "@/server/expenses";
import { BalanceSummary, ExpenseList } from "./expense-list";

// Expenses tab (R8): your balance, the newest 50 expenses, and the + button.
export default async function ExpensesPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const [view, page] = await Promise.all([readGroup(token), listExpenses(token, 0)]);
  const base = view.group.baseCurrency;
  return (
    <div className="flex flex-col gap-4">
      <BalanceSummary balances={view.balances} baseCurrency={base} expenseCount={view.expenseCount} />
      <h2 className="text-lg font-bold">Expenses</h2>
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
