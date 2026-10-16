import { PageHeader } from "@/app/_components/ui";
import { MembersList } from "./members-list";

export default async function MembersPage({ params }: PageProps<"/g/[token]/members">) {
  const { token } = await params;
  return (
    <div>
      <PageHeader title="Members" back={`/g/${token}/group`} />
      <MembersList />
    </div>
  );
}
