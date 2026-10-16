import Link from "next/link";
import { ChevronIcon, ListIcon, ReceiptIcon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/ui";

// R50: the "+" button opens Add expense or Scan receipt.
export default async function AddPage({ params }: PageProps<"/g/[token]/add">) {
  const { token } = await params;
  const option = "flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-card px-4 hover:border-brand";
  return (
    <div>
      <PageHeader title="Add" back={`/g/${token}`} />
      <div className="flex flex-col gap-3">
        <Link href={`/g/${token}/expenses/new`} className={option}>
          <ListIcon className="h-7 w-7 text-brand" />
          <span className="flex-1">
            <span className="block text-lg font-semibold">Add expense</span>
            <span className="block text-sm text-muted">Enter an amount and how to split it</span>
          </span>
          <ChevronIcon className="h-5 w-5 text-muted" />
        </Link>
        <Link href={`/g/${token}/scan`} className={option}>
          <ReceiptIcon className="h-7 w-7 text-brand" />
          <span className="flex-1">
            <span className="block text-lg font-semibold">Scan receipt</span>
            <span className="block text-sm text-muted">Photo or screenshot; split item by item</span>
          </span>
          <ChevronIcon className="h-5 w-5 text-muted" />
        </Link>
      </div>
    </div>
  );
}
