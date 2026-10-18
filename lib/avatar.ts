// Coloured initial avatars (SPEC v1.5, R71): the same member always gets the same colour.

/**
 * Background colours for avatars, all with white initials at ≥ 4.5:1 (WCAG AA), and distinct
 * from each other. The same set is used in both themes.
 */
export const AVATAR_COLORS = [
  "#0f766e", // teal
  "#6d28d9", // violet
  "#be185d", // pink
  "#b45309", // amber
  "#1d4ed8", // blue
  "#15803d", // green
  "#b91c1c", // red
  "#4338ca", // indigo
  "#0e7490", // cyan
  "#a21caf", // fuchsia
] as const;

/** Up to two initials: first letters of the first and last words ("Rohan Kumar" → "RK", "aarav" → "A"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = (w: string) => Array.from(w)[0]?.toLocaleUpperCase("en-IN") ?? "";
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

/** FNV-1a over the member id: stable across renames, devices and sessions. */
export function avatarColor(memberId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < memberId.length; i++) {
    h ^= memberId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
