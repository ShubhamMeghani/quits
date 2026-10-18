// Expense-row category icons (visual only): a stable icon and colour per category, in both themes.
import { CATEGORIES, type Category } from "./splits";

export type CategoryIconName = "food" | "groceries" | "rent" | "utilities" | "travel" | "transport" | "entertainment" | "shopping" | "health" | "education" | "other";

/**
 * `light` is the icon colour on the light theme, `dark` on the dark theme. The circle behind the icon
 * is the same colour mixed into the card (12% light, 16% dark; see `.cat-icon` in globals.css), and
 * every icon is ≥ 3:1 against its circle (WCAG 1.4.11 non-text contrast), checked in tests.
 */
export const CATEGORY_STYLE: Record<Category, { icon: CategoryIconName; light: string; dark: string }> = {
  "Food & Drinks": { icon: "food", light: "#c2410c", dark: "#fdba74" },
  Groceries: { icon: "groceries", light: "#15803d", dark: "#86efac" },
  Rent: { icon: "rent", light: "#4338ca", dark: "#a5b4fc" },
  Utilities: { icon: "utilities", light: "#a16207", dark: "#fde047" },
  Travel: { icon: "travel", light: "#0369a1", dark: "#7dd3fc" },
  Transport: { icon: "transport", light: "#0e7490", dark: "#67e8f9" },
  Entertainment: { icon: "entertainment", light: "#be185d", dark: "#f9a8d4" },
  Shopping: { icon: "shopping", light: "#6d28d9", dark: "#c4b5fd" },
  Health: { icon: "health", light: "#b91c1c", dark: "#fca5a5" },
  Education: { icon: "education", light: "#1d4ed8", dark: "#93c5fd" },
  Other: { icon: "other", light: "#475569", dark: "#cbd5e1" },
};

/** Unknown or legacy categories fall back to "Other". */
export function categoryStyle(category: string) {
  return (CATEGORIES as readonly string[]).includes(category) ? CATEGORY_STYLE[category as Category] : CATEGORY_STYLE.Other;
}
