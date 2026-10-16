import { PageHeader } from "@/app/_components/ui";
import { Scanner } from "./scanner";

export default async function ScanPage({ params }: PageProps<"/g/[token]/scan">) {
  const { token } = await params;
  return (
    <div>
      <PageHeader title="Scan receipt" back={`/g/${token}/add`} />
      <Scanner />
    </div>
  );
}
