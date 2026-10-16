import { PageHeader } from "@/app/_components/ui";
import { todayIST } from "@/lib/currency";
import { requireGroup } from "@/server/context";
import { ExpenseForm } from "../expense-form";

export default async function NewExpensePage({ params }: PageProps<"/g/[token]/expenses/new">) {
  const { token } = await params;
  const group = await requireGroup(token);
  return (
    <div>
      <PageHeader title="Add expense" back={`/g/${token}`} />
      <ExpenseForm baseCurrency={group.baseCurrency} defaultSplit={group.defaultSplit} today={todayIST()} />
    </div>
  );
}
