// R5 (D-36): browser glue for lib/recent-groups.ts. Reads and writes `localStorage` only; nothing
// here talks to the server. Blocked storage gives an empty list and silently skips writes.
import { loadRecent, RECENT_KEY, saveRecent, type RecentGroup } from "@/lib/recent-groups";

const listeners = new Set<() => void>();
const EMPTY: RecentGroup[] = [];
let cache: { raw: string | null | undefined; value: RecentGroup[] } = { raw: undefined, value: EMPTY };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function rawValue(): string | null {
  try {
    return window.localStorage.getItem(RECENT_KEY);
  } catch {
    return null;
  }
}

/** useSyncExternalStore snapshot: the same array until the stored text changes. */
export function getRecentSnapshot(): RecentGroup[] {
  const raw = rawValue();
  if (raw !== cache.raw) cache = { raw, value: loadRecent(storage()) };
  return cache.value;
}

/** Server and hydration snapshot: the list only exists in the browser. */
export const getServerRecentSnapshot = (): RecentGroup[] => EMPTY;

export function subscribeRecent(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the list (or cleared storage).
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === RECENT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Applies a pure update from lib/recent-groups.ts and notifies the list. */
export function updateRecent(update: (list: RecentGroup[]) => RecentGroup[]) {
  const s = storage();
  saveRecent(s, update(loadRecent(s)));
  listeners.forEach((l) => l());
}
