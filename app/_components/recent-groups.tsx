"use client";

// R5 (Should): groups opened on this device.
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronIcon } from "./icons";
import { readRecent, type RecentGroup } from "./identity";

const noop = () => () => undefined;
let cache: { raw: string | null; value: RecentGroup[] } = { raw: null, value: [] };

function snapshot(): RecentGroup[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem("quits:recent");
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, value: readRecent() };
  return cache.value;
}

const empty: RecentGroup[] = [];

export function RecentGroups() {
  const groups = useSyncExternalStore(noop, snapshot, () => empty);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="recent-groups" className="flex flex-col gap-2">
      <h2 id="recent-groups" className="text-lg font-bold">
        Your groups on this device
      </h2>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {groups.map((g) => (
          <li key={g.token}>
            <Link href={`/g/${g.token}`} className="flex min-h-14 items-center gap-3 px-4 hover:bg-slate-50">
              <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
              <ChevronIcon className="h-5 w-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
