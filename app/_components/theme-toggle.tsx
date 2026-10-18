"use client";

// R71 (Should, SPEC v1.5): Dark / Light / System, remembered on this device (localStorage with
// try/catch; if storage is blocked the choice lasts for this page only).
import { useLayoutEffect, useSyncExternalStore } from "react";
import { parseTheme, THEME_KEY, type ThemePref } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

const EVENT = "quits:theme";

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      document.documentElement.setAttribute("data-theme", parseTheme(e.newValue));
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

const current = (): ThemePref => parseTheme(document.documentElement.getAttribute("data-theme"));

function choose(pref: ThemePref) {
  document.documentElement.setAttribute("data-theme", pref);
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage blocked: the theme still applies to this page
  }
  window.dispatchEvent(new Event(EVENT));
}

const OPTIONS: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export function ThemeToggle() {
  // Server snapshot: null, so nothing is shown as selected until the stored choice is known.
  const pref = useSyncExternalStore<ThemePref | null>(subscribe, current, () => null);
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-track p-1" data-testid="theme-toggle">
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(value)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
              selected ? "bg-card text-foreground shadow-card" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * For pages Next renders outside the root layout's document (the group 404 is rendered on the
 * client in Next's error document, where the <head> script never runs): applies the stored theme
 * before the page is painted.
 */
export function ApplyStoredTheme() {
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_KEY);
    } catch {
      stored = null;
    }
    document.documentElement.setAttribute("data-theme", parseTheme(stored));
  }, []);
  return null;
}
