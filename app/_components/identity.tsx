"use client";

// R4: self-declared identity, remembered per group on this device (localStorage).
// R5 (Should): groups opened on this device are listed on the home screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type ShellMember = { id: string; name: string; upiId: string | null; upiName: string | null; archived: boolean };
export type ShellGroup = { token: string; name: string; baseCurrency: string; isDemo: boolean };

const meKey = (token: string) => `quits:me:${token}`;
const RECENT_KEY = "quits:recent";
const listeners = new Set<() => void>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage blocked (private mode): identity lasts for this page only
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = () => l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sets the remembered member for a group (used right after creating a group). */
export function rememberMe(token: string, memberId: string) {
  safeSet(meKey(token), memberId);
}

export type RecentGroup = { token: string; name: string; openedAt: number };

export function readRecent(): RecentGroup[] {
  try {
    const parsed = JSON.parse(safeGet(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((g) => typeof g?.token === "string" && typeof g?.name === "string") : [];
  } catch {
    return [];
  }
}

function touchRecent(token: string, name: string) {
  const rest = readRecent().filter((g) => g.token !== token);
  safeSet(RECENT_KEY, JSON.stringify([{ token, name, openedAt: Date.now() }, ...rest].slice(0, 10)));
}

type Ctx = {
  group: ShellGroup;
  members: ShellMember[];
  /** undefined while loading from storage; null when no identity is chosen. */
  me: string | null | undefined;
  meMember: ShellMember | null;
  setMe: (id: string | null) => void;
  nameOf: (id: string) => string;
};

const IdentityContext = createContext<Ctx | null>(null);

export function useIdentity(): Ctx {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}

export function IdentityProvider({ group, members, children }: { group: ShellGroup; members: ShellMember[]; children: React.ReactNode }) {
  // undefined on the server and during hydration; then the stored id (or null).
  const stored = useSyncExternalStore<string | null | undefined>(
    subscribe,
    () => safeGet(meKey(group.token)),
    () => undefined,
  );
  const me: string | null | undefined =
    stored === undefined ? undefined : stored && members.some((m) => m.id === stored) ? stored : null;

  useEffect(() => {
    touchRecent(group.token, group.name);
  }, [group.token, group.name]);

  const setMe = useCallback((id: string | null) => safeSet(meKey(group.token), id), [group.token]);
  const value = useMemo<Ctx>(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    return {
      group,
      members,
      me,
      meMember: me ? (byId.get(me) ?? null) : null,
      setMe,
      nameOf: (id: string) => (id === me ? "You" : (byId.get(id)?.name ?? "Someone")),
    };
  }, [group, members, me, setMe]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}
