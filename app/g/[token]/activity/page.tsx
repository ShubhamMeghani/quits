import { PageHeader } from "@/app/_components/ui";
import { listActivity } from "@/server/groups";
import { ActivityList } from "./activity-list";

export default async function ActivityPage({ params }: PageProps<"/g/[token]/activity">) {
  const { token } = await params;
  const page = await listActivity(token, 0);
  return (
    <div>
      <PageHeader title="Activity" />
      <ActivityList initial={page.items} hasMore={page.hasMore} />
    </div>
  );
}
