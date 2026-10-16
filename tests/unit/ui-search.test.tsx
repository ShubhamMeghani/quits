import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExpensesHeader } from "@/app/g/[token]/expenses-header";
import { formatPercent, percentShares } from "@/lib/stats";

describe("BUG-3: the Expenses screen has a visible search entry point", () => {
  it("renders a labelled link to the group's search page next to the Expenses heading", () => {
    const html = renderToStaticMarkup(<ExpensesHeader token="abc_DEF-123" />);
    expect(html).toContain(">Expenses</h2>");
    const link = html.match(/<a [^>]*>/)?.[0] ?? "";
    expect(link).toContain('href="/g/abc_DEF-123/search"');
    expect(link).toContain('aria-label="Search expenses"');
    // Visible text, not just an icon, and a ≥ 44 px tap target (R51).
    expect(html).toContain("<span>Search</span>");
    expect(link).toMatch(/\bmin-h-11\b/);
    expect(link).toMatch(/\bmin-w-11\b/);
    expect(html).toContain("<svg");
  });
});

describe("POLISH-1: % of total next to each category bar", () => {
  it("gives exact shares when they divide evenly", () => {
    expect(percentShares([50000, 30000, 20000])).toEqual([50, 30, 20]);
    expect(percentShares([123456])).toEqual([100]);
  });

  it("rounds to one decimal and always adds up to exactly 100.0% (largest remainder, ties to the earlier entry)", () => {
    expect(percentShares([100, 100, 100])).toEqual([33.4, 33.3, 33.3]);
    // 2/3 = 66.666…, 1/3 = 33.333… → 66.7 + 33.3
    expect(percentShares([200, 100])).toEqual([66.7, 33.3]);
    // Naive rounding of 1/7 each would give 7 × 14.3 = 100.1%.
    const sevenths = percentShares([1, 1, 1, 1, 1, 1, 1]);
    // 1000 tenths / 7 = 142 rem 6 → the first six get 14.3, the last 14.2.
    expect(sevenths).toEqual([14.3, 14.3, 14.3, 14.3, 14.3, 14.3, 14.2]);
    expect(Math.round(sevenths.reduce((a, b) => a + b, 0) * 10)).toBe(1000);
  });

  it("each share is within 0.1 point of the exact value, and the sum is 100.0 for random inputs", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let t = 0; t < 500; t++) {
      const values = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => Math.floor(rand() * 5_000_000));
      if (values.every((v) => v === 0)) continue;
      const total = values.reduce((a, b) => a + b, 0);
      const shares = percentShares(values);
      expect(Math.round(shares.reduce((a, b) => a + b, 0) * 10)).toBe(1000);
      shares.forEach((s, i) => expect(Math.abs(s - (values[i] / total) * 100)).toBeLessThan(0.1 + 1e-9));
    }
  });

  it("handles empty and zero totals, rejects negatives, and formats with one decimal", () => {
    expect(percentShares([])).toEqual([]);
    expect(percentShares([0, 0])).toEqual([0, 0]);
    expect(() => percentShares([100, -1])).toThrow();
    expect(formatPercent(33.4)).toBe("33.4%");
    expect(formatPercent(100)).toBe("100.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});
