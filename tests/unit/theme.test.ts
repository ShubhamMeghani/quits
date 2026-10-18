import fs from "node:fs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { QR_OPTIONS } from "@/app/_components/upi-qr";
import { AVATAR_COLORS, avatarColor, initials } from "@/lib/avatar";
import { DEFAULT_THEME, parseTheme, THEME_COLOR, THEME_INIT_SCRIPT, THEME_KEY } from "@/lib/theme";

// AC-58 (unit part), R71 (SPEC v1.5): themes, contrast, avatars and the always-black-on-white QR.

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = fs.readFileSync("app/globals.css", "utf8");

/** The hex colour tokens of the first block whose selector matches. */
function tokens(selector: RegExp): Record<string, string> {
  const m = css.match(selector);
  if (!m) throw new Error(`no block for ${selector}`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((t) => [t[1], t[2].toLowerCase()]));
}

const dark = tokens(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/);
const light = tokens(/\n\[data-theme="light"\]\s*\{([^}]*)\}/);
const systemLight = tokens(/@media \(prefers-color-scheme: light\)\s*\{\s*\[data-theme="system"\]\s*\{([^}]*)\}/);

describe("AC-58: theme tokens (globals.css)", () => {
  it("defines the same colour tokens for dark and light, and System-in-light-mode equals Light exactly", () => {
    expect(Object.keys(dark).length).toBeGreaterThan(20);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(systemLight).toEqual(light);
  });

  // Text colour on background colour; every pair used for text must be WCAG AA (4.5:1).
  const pairs: [string, string][] = [
    ["foreground", "background"],
    ["foreground", "card"],
    ["foreground", "card-hover"],
    ["foreground", "track"],
    ["muted", "background"],
    ["muted", "card"],
    ["muted", "card-hover"],
    ["muted", "track"],
    ["brand", "background"],
    ["brand", "card"],
    ["brand", "card-hover"],
    ["brand", "brand-soft"],
    ["brand-fg", "brand-from"],
    ["brand-fg", "brand-to"],
    ["brand-soft-fg", "brand-soft"],
    ["ok", "background"],
    ["ok", "card"],
    ["ok-soft-fg", "ok-soft"],
    ["warn", "card"],
    ["warn-soft-fg", "warn-soft"],
    ["danger", "background"],
    ["danger", "card"],
    ["danger", "danger-soft"],
    ["danger-soft-fg", "danger-soft"],
    ["foreground", "brand-soft"],
    ["foreground", "warn-soft"],
    ["foreground", "danger-soft"],
  ];
  for (const [name, t] of [
    ["dark", dark],
    ["light", light],
  ] as const) {
    it(`meets WCAG AA (≥ 4.5:1) for every text/background pair in the ${name} theme`, () => {
      const failures = pairs.map(([f, b]) => [f, b, contrast(t[f], t[b])] as const).filter(([, , r]) => r < 4.5);
      expect(failures).toEqual([]);
    });
  }

  it("dark theme: near-black background, lighter elevated cards, teal accent", () => {
    expect(contrast(dark.background, "#000000")).toBeLessThan(1.2);
    expect(contrast(dark.card, "#000000")).toBeGreaterThan(contrast(dark.background, "#000000"));
    expect(dark.brand).toBe("#2dd4bf");
  });

  it("PWA theme_color and the browser theme colour match the dark background", () => {
    const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
    expect(THEME_COLOR).toBe(dark.background);
    expect(manifest.theme_color).toBe(dark.background);
    expect(manifest.background_color).toBe(dark.background);
  });
});

describe("AC-58: theme preference (lib/theme.ts)", () => {
  it("parses the stored choice; anything else is the dark default", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("dark")).toBe("dark");
    for (const bad of [null, undefined, "", "LIGHT", "blue", '{"x":1}']) expect(parseTheme(bad)).toBe("dark");
  });

  /** Runs the <head> script against a fake document and storage. */
  function runInit(getItem: () => string | null): string | null {
    let applied: string | null = null;
    const document = { documentElement: { setAttribute: (k: string, v: string) => k === "data-theme" && (applied = v) } };
    const localStorage = { getItem };
    new Function("document", "localStorage", THEME_INIT_SCRIPT)(document, localStorage);
    return applied;
  }

  it("the pre-paint script applies the stored theme, falls back to dark, and survives blocked storage", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(runInit(() => "light")).toBe("light");
    expect(runInit(() => "system")).toBe("system");
    expect(runInit(() => null)).toBe("dark");
    expect(runInit(() => "garbage")).toBe("dark");
    expect(
      runInit(() => {
        throw new Error("SecurityError");
      }),
    ).toBe("dark");
  });
});

describe("AC-58: member avatars (lib/avatar.ts)", () => {
  it("initials: first letters of the first and last words", () => {
    expect(initials("Aarav")).toBe("A");
    expect(initials("Rohan Kumar")).toBe("RK");
    expect(initials("  priya   s  ")).toBe("PS");
    expect(initials("Mary Ann Lee")).toBe("ML");
    expect(initials("")).toBe("?");
    expect(initials("Élodie")).toBe("É");
  });

  it("the colour is stable per member id and comes from the palette", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(avatarColor(id)).toBe(avatarColor(id));
    expect(AVATAR_COLORS).toContain(avatarColor(id));
    const used = new Set(Array.from({ length: 60 }, (_, i) => avatarColor(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)));
    expect(used.size).toBeGreaterThanOrEqual(6);
  });

  it("white initials meet WCAG AA on every avatar colour", () => {
    for (const c of AVATAR_COLORS) expect(contrast("#ffffff", c)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("AC-58: the UPI QR is always black on white with a quiet zone (R24, R71)", () => {
  it("uses #000000 modules on #ffffff with a 4-module margin, independent of the theme", async () => {
    expect(QR_OPTIONS.margin).toBe(4);
    expect(QR_OPTIONS.color).toEqual({ dark: "#000000", light: "#ffffff" });
    const svg = await QRCode.toString("upi://pay?pa=priya%40okicici&pn=Priya&am=200.00&cu=INR", { ...QR_OPTIONS, type: "svg" });
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#000000"');
    // The SVG's viewBox includes the margin: modules + 2 × 4.
    const size = Number(svg.match(/viewBox="0 0 (\d+) \1"/)?.[1]);
    expect((size - 8) % 4).toBe(1); // QR sizes are 21, 25, 29 … modules (4k + 1)
  });
});
