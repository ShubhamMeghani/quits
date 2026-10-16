import { PageHeader } from "@/app/_components/ui";
import { listRules } from "@/server/recurring";
import { RulesList } from "./rules-list";

export default async function RecurringPage({ params }: PageProps<"/g/[token]/recurring">) {
  const { token } = await params;
  const rules = await listRules(token);
  return (
    <div>
      <PageHeader title="Recurring expenses" back={`/g/${token}/group`} />
      <RulesList rules={rules} />
    </div>
  );
}
