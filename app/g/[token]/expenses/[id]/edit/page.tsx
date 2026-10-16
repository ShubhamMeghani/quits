import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { todayIST } from "@/lib/currency";
import { loadExpense, loadMembers, requireGroup } from "@/server/context";
import { idSchema } from "@/server/schemas";
import { ExpenseForm } from "../../expense-form";

export default async function EditExpensePage({ params }: PageProps<"/g/[token]/expenses/[id]/edit">) {
  const { token, id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const expense = await loadExpense(group.id, id, members).catch(() => null);
  if (!expense || expense.deletedAt) notFound();
  if (expense.splitType === "itemized") redirect(`/g/${token}/expenses/${id}`);
  return (
    <div>
      <PageHeader title="Edit expense" back={`/g/${token}/expenses/${id}`} />
      <ExpenseForm baseCurrency={group.baseCurrency} defaultSplit={group.defaultSplit} today={todayIST()} initial={expense} />
    </div>
  );
}
