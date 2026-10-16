import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { idSchema } from "@/server/schemas";
import { MemberForm } from "./member-form";

export default async function MemberPage({ params }: PageProps<"/g/[token]/members/[id]">) {
  const { token, id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  return (
    <div>
      <PageHeader title="Member" back={`/g/${token}/members`} />
      <MemberForm id={id} />
    </div>
  );
}
