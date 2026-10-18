"use client";

// R5 (Should, v1.3, D-36): "Your groups" on the home page, from this device's list only.
// Nothing about the list is sent to the server; an entry is just a link to its group.
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { getRecentSnapshot, getServerRecentSnapshot, subscribeRecent, updateRecent } from "@/app/_lib/recent-store";
import { formatLastOpened, markUnavailable, removeRecent, tokenFromPath } from "@/lib/recent-groups";
import { ChevronIcon, CloseIcon } from "./icons";

const noSubscribe = () => () => undefined;
/** The current minute (stable within a minute, so the snapshot is not a new value on every read). */
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

export function RecentGroups() {
  const groups = useSyncExternalStore(subscribeRecent, getRecentSnapshot, getServerRecentSnapshot);
  const now = useSyncExternalStore(noSubscribe, currentMinute, () => 0);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="your-groups" className="flex flex-col gap-2">
      <h2 id="your-groups" className="text-lg font-bold">
        Your groups
      </h2>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card" data-testid="your-groups">
        {groups.map((g) => (
          <li key={g.token} className="flex items-center" data-testid="your-group">
            {g.unavailable ? (
              <div className="flex min-h-14 min-w-0 flex-1 flex-col justify-center px-4 py-1.5">
                <span className="truncate font-semibold text-muted" data-user-text>
                  {g.name}
                </span>
                <span className="text-sm font-medium text-danger">No longer available</span>
              </div>
            ) : (
              // prefetch={false}: no request for a listed group until it is opened (D-36; App Router: never on viewport or hover).
              <Link href={`/g/${g.token}`} prefetch={false} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-4 py-1.5 hover:bg-card-hover">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold" data-user-text>
                      {g.name}
                    </span>
                    {g.demo && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn-soft-fg">Demo</span>}
                  </span>
                  {/* Only a long member name is cut; the compact time always shows in full. */}
                  <span className="flex min-w-0 text-sm text-muted">
                    {g.memberName && (
                      <span className="truncate" data-user-text>
                        You: {g.memberName}
                      </span>
                    )}
                    <span className="shrink-0 whitespace-nowrap">
                      {g.memberName ? " · " : ""}
                      {formatLastOpened(g.lastOpened, now)}
                    </span>
                  </span>
                </span>
                <ChevronIcon className="h-5 w-5 shrink-0 text-muted" />
              </Link>
            )}
            <button
              type="button"
              aria-label={`Remove ${g.name} from this device's list`}
              title="Remove from this device's list"
              onClick={() => updateRecent((list) => removeRecent(list, g.token))}
              className="mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card-hover hover:text-danger"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Saved on this device only and not synced to your other devices. Clearing your browser data clears this list. Removing a group here doesn&apos;t delete it: its link
        still works.
      </p>
    </section>
  );
}

/** On the "Group not found" page: if this token is in the list, show it as "No longer available". */
export function MarkGroupUnavailable() {
  useEffect(() => {
    const token = tokenFromPath(window.location.pathname);
    if (token) updateRecent((list) => markUnavailable(list, token));
  }, []);
  return null;
}
