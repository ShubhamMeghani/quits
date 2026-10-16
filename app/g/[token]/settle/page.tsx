import { PageHeader } from "@/app/_components/ui";
import { todayIST } from "@/lib/currency";
import { readGroup } from "@/server/groups";
import { listSettlements } from "@/server/settlements";
import { SettleView } from "./settle-view";

export default async function SettlePage({ params }: PageProps<"/g/[token]/settle">) {
  const { token } = await params;
  const [view, settlements] = await Promise.all([readGroup(token), listSettlements(token)]);
  return (
    <div>
      <PageHeader title="Settle up" />
      <SettleView
        balances={view.balances}
        plan={view.plan}
        naiveCount={view.naiveCount}
        baseCurrency={view.group.baseCurrency}
        settlements={settlements}
        today={todayIST()}
      />
    </div>
  );
}
