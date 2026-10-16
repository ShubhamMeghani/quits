import { Skeleton } from "@/app/_components/ui";

export default function Loading() {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-24" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
