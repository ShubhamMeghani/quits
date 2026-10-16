import Link from "next/link";
import { SearchIcon } from "@/app/_components/icons";

// BUG-3: Search (R40) had no visible entry point; it was only reachable by typing /search.
// The Expenses heading now carries a labelled magnifier button (≥ 44 px tap target, R51).
export function ExpensesHeader({ token }: { token: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">Expenses</h2>
      <Link
        href={`/g/${token}/search`}
        aria-label="Search expenses"
        data-testid="search-link"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 font-semibold text-brand hover:bg-teal-50"
      >
        <SearchIcon className="h-5 w-5" />
        <span>Search</span>
      </Link>
    </div>
  );
}
