import { PageHeader } from "@/app/_components/ui";
import { readGroup } from "@/server/groups";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: PageProps<"/g/[token]/settings">) {
  const { token } = await params;
  const view = await readGroup(token);
  return (
    <div>
      <PageHeader title="Group settings" back={`/g/${token}/group`} />
      <SettingsForm defaultSplit={view.group.defaultSplit} hasExpenses={view.expenseCount > 0} />
    </div>
  );
}
