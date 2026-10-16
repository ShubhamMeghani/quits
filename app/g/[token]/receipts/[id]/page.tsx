import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { todayIST } from "@/lib/currency";
import { requireGroup } from "@/server/context";
import { loadReceipt } from "@/server/receipts";
import { idSchema } from "@/server/schemas";
import { ReceiptEditor } from "./receipt-editor";

export default async function ReceiptPage({ params }: PageProps<"/g/[token]/receipts/[id]">) {
  const { token, id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const group = await requireGroup(token);
  const receipt = await loadReceipt(group.id, id).catch(() => null);
  if (!receipt) notFound();
  return (
    <div>
      <PageHeader title="Check the receipt" back={`/g/${token}`} />
      {/* Remount on fresh server data so "Refresh" shows claims made on other devices (R36). */}
      <ReceiptEditor key={JSON.stringify(receipt)} receipt={receipt} today={todayIST()} />
    </div>
  );
}
