import { PageHeader } from "@/app/_components/ui";
import { SharePanel } from "./share-panel";

export default async function SharePage({ params, searchParams }: PageProps<"/g/[token]/share">) {
  const { token } = await params;
  const { created } = await searchParams;
  return (
    <div>
      <PageHeader title="Share" back={`/g/${token}/group`} />
      <SharePanel created={created === "1"} />
    </div>
  );
}
