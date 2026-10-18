import { Skeleton } from "@/app/_components/ui";

// R51: loading state for group screens: the shapes of a balance card and expense rows.
export default function Loading() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-32" />
      <Skeleton className="mt-2 h-6 w-1/3" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
