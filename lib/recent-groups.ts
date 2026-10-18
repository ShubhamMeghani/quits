// R5 (Should, v1.3, D-36): "Your groups" on the home page, without accounts.
// Pure list logic; the browser code only passes `localStorage` (or null) in. Nothing here is ever
// sent to the server. The list is per device: clearing browser data clears it, and removing an
// entry never affects the group itself.

export const RECENT_KEY = "quits:recent";
export const RECENT_CAP = 20;

/** Same format as server/token.ts TOKEN_RE (kept separate so this module stays client-safe). */
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

export type RecentGroup = {
  token: string;
  name: string;
  /** The member picked on this device, if any. */
  memberName: string | null;
  /** Epoch milliseconds. */
  lastOpened: number;
  demo: boolean;
  /** Set when the link returned 404 (e.g. a cleaned-up demo). */
  unavailable: boolean;
};

export type Visit = {
  token: string;
  name: string;
  /** A name sets it, null clears it, undefined keeps what was stored. */
  memberName?: string | null;
  demo: boolean;
};

/** The two Storage methods used; any of them may throw (blocked storage). */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** One stored entry, or null if it is unusable. Accepts the pre-v1.3 shape { token, name, openedAt }. */
function parseEntry(v: unknown): RecentGroup | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const token = typeof e.token === "string" ? e.token : "";
  const name = text(e.name, 60);
  const when = typeof e.lastOpened === "number" ? e.lastOpened : e.openedAt;
  if (!TOKEN_RE.test(token) || !name || typeof when !== "number" || !Number.isFinite(when) || when < 0) return null;
  return {
    token,
    name,
    memberName: text(e.memberName, 30),
    lastOpened: when,
    demo: e.demo === true,
    unavailable: e.unavailable === true,
  };
}

/** Newest first, one entry per token, at most RECENT_CAP. */
function normalize(list: readonly RecentGroup[]): RecentGroup[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .filter((g) => (seen.has(g.token) ? false : (seen.add(g.token), true)))
    .slice(0, RECENT_CAP);
}

/** Never throws: corrupt or non-JSON storage gives [], and wrongly shaped entries are dropped. */
export function parseRecent(raw: string | null | undefined): RecentGroup[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return normalize(data.map(parseEntry).filter((g): g is RecentGroup => g !== null));
}

export const serializeRecent = (list: readonly RecentGroup[]): string => JSON.stringify(normalize(list));

/** Adds the group, or updates it (name, member, demo, time) and moves it to the top. */
export function recordVisit(list: readonly RecentGroup[], visit: Visit, now: number): RecentGroup[] {
  const prev = list.find((g) => g.token === visit.token);
  const entry = parseEntry({
    token: visit.token,
    name: visit.name,
    memberName: visit.memberName === undefined ? (prev?.memberName ?? null) : visit.memberName,
    lastOpened: now,
    demo: visit.demo,
    unavailable: false,
  });
  if (!entry) return normalize(list);
  return normalize([entry, ...list.filter((g) => g.token !== visit.token)]);
}

/** Removes the group from this device's list only. */
export const removeRecent = (list: readonly RecentGroup[], token: string): RecentGroup[] => normalize(list.filter((g) => g.token !== token));

/** After a 404: marks a listed group "No longer available". Unlisted tokens are not added. */
export const markUnavailable = (list: readonly RecentGroup[], token: string): RecentGroup[] =>
  normalize(list.map((g) => (g.token === token ? { ...g, unavailable: true } : g)));

/** Reads the list; blocked or broken storage gives []. */
export function loadRecent(storage: StorageLike | null | undefined): RecentGroup[] {
  try {
    return parseRecent(storage?.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

/** Writes the list; returns false (and changes nothing) if storage is blocked or full. */
export function saveRecent(storage: StorageLike | null | undefined, list: readonly RecentGroup[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECENT_KEY, serializeRecent(list));
    return true;
  } catch {
    return false;
  }
}

/** The token in a /g/{token}/… path, or null. */
export function tokenFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/g\/([^/?#]+)/);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

/** "Opened today, 14:05" · "Opened yesterday" · "Opened 3 Oct" · "Opened 3 Oct 2025" (device time zone by default). */
export function formatLastOpened(ts: number, now: number, timeZone?: string): string {
  const day = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  const today = day(now);
  if (day(ts) === today) {
    const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(ts);
    return `Opened today, ${time}`;
  }
  if (day(ts) === day(now - 86_400_000)) return "Opened yesterday";
  const sameYear = day(ts).slice(0, 4) === today.slice(0, 4);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(ts);
  return `Opened ${date}`;
}
