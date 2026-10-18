import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_STYLE, categoryStyle } from "@/lib/category-style";
import { CATEGORIES } from "@/lib/splits";

// v1.6 polish: expense-row category icons, stable per category and legible in both themes.

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** color-mix(in srgb, fg p%, bg) */
const mix = (fg: number[], bg: number[], p: number) => fg.map((v, i) => v * p + bg[i] * (1 - p));

const css = fs.readFileSync("app/globals.css", "utf8");
const cardOf = (block: RegExp) => css.match(block)![1].match(/--card:\s*(#[0-9a-f]{6});/i)![1];
const darkCard = cardOf(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/);
const lightCard = cardOf(/\n\[data-theme="light"\]\s*\{([^}]*)\}/);

describe("category icons (lib/category-style.ts)", () => {
  it("every category has a style, and the icons are all different", () => {
    for (const c of CATEGORIES) expect(CATEGORY_STYLE[c]).toBeDefined();
    expect(new Set(CATEGORIES.map((c) => CATEGORY_STYLE[c].icon)).size).toBe(CATEGORIES.length);
  });

  it("unknown or legacy categories fall back to Other; the same category always gets the same style", () => {
    expect(categoryStyle("Pets")).toBe(CATEGORY_STYLE.Other);
    expect(categoryStyle("")).toBe(CATEGORY_STYLE.Other);
    expect(categoryStyle("Rent")).toBe(categoryStyle("Rent"));
  });

  it("each icon is ≥ 3:1 against its soft circle in both themes (WCAG 1.4.11), using the CSS mix ratios", () => {
    expect(css).toContain("color-mix(in srgb, var(--cat-dark) 16%, var(--card))");
    expect(css).toContain("color-mix(in srgb, var(--cat-light) 12%, var(--card))");
    for (const c of CATEGORIES) {
      const { light, dark } = CATEGORY_STYLE[c];
      expect(contrast(rgb(light), mix(rgb(light), rgb(lightCard), 0.12))).toBeGreaterThanOrEqual(3);
      expect(contrast(rgb(dark), mix(rgb(dark), rgb(darkCard), 0.16))).toBeGreaterThanOrEqual(3);
    }
  });
});
