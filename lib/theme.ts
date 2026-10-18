// R71 (Should, SPEC v1.5): Dark (default) / Light / System theme, remembered on this device only.

export const THEME_KEY = "quits:theme";
export const THEMES = ["dark", "light", "system"] as const;
export type ThemePref = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemePref = "dark";

/** Stored text → preference; anything else (missing, corrupt, old) is the dark default. */
export function parseTheme(raw: string | null | undefined): ThemePref {
  return (THEMES as readonly string[]).includes(raw ?? "") ? (raw as ThemePref) : DEFAULT_THEME;
}

/**
 * Inline script for <head>: applies the stored preference to <html data-theme> before the first
 * paint, so a light-theme user never sees a dark flash. Storage access is wrapped in try/catch;
 * if it is blocked the page simply stays dark.
 */
export const THEME_INIT_SCRIPT = `(function(){var t="${DEFAULT_THEME}";try{var s=localStorage.getItem("${THEME_KEY}");if(${JSON.stringify(THEMES)}.indexOf(s)>=0)t=s}catch(e){}document.documentElement.setAttribute("data-theme",t)})()`;

/** Theme colour of the PWA and the browser bar: the dark background (R52). */
export const THEME_COLOR = "#0b1211";
