import { describe, expect, it } from "vitest";
import {
  convertMinor,
  exponent,
  frankfurterRateUrl,
  getRate,
  manualRate,
  normalizeRate,
  parseFrankfurterRate,
  todayIST,
  type CachedRate,
  type RateDeps,
} from "@/lib/currency";
import { buildExpenseAmounts } from "@/lib/splits";

function deps(overrides: Partial<RateDeps> = {}) {
  const cache = new Map<string, CachedRate>();
  const calls: string[] = [];
  const d: RateDeps = {
    cacheGet: async (date, b, q) => cache.get(`${date}|${b}|${q}`) ?? null,
    cacheSet: async (date, b, q, v) => void cache.set(`${date}|${b}|${q}`, v),
    fetchJson: async (url) => {
      calls.push(url);
      return { date: "2026-10-01", base: "USD", quote: "INR", rate: 95.98 };
    },
    today: () => "2026-10-16",
    ...overrides,
  };
  return { d, cache, calls };
}

describe("conversion (R17)", () => {
  it("AC-6: USD 12.34 at 83.4567 → 102986 paise; equal among 3 → [34329, 34329, 34328]", () => {
    expect(convertMinor(1234, "USD", "INR", "83.4567")).toBe(102986);
    const r = buildExpenseAmounts({
      amountMinor: 1234,
      currency: "USD",
      baseCurrency: "INR",
      rate: "83.4567",
      payers: { A: 1234 },
      split: { type: "equal", participants: ["A", "B", "C"] },
      memberOrder: ["A", "B", "C"],
    });
    expect(r.ok && r.value.baseAmountMinor).toBe(102986);
    expect(r.ok && r.value.splits.map((s) => s.owedBaseMinor)).toEqual([34329, 34329, 34328]);
    expect(r.ok && r.value.payers.map((p) => p.baseAmountMinor)).toEqual([102986]);
  });
  it("AC-6: THB 10.05 at 2.35 → exactly 2362 paise (half-up of 2361.75)", () => {
    expect(convertMinor(1005, "THB", "INR", "2.35")).toBe(2362);
    // Exact half cases round up without float error: 1 cent at 0.5 → 0.5 paise → 1.
    expect(convertMinor(1, "USD", "INR", "0.5")).toBe(1);
    expect(convertMinor(3, "USD", "INR", "0.5")).toBe(2);
  });
  it("AC-6: JPY 1000 (exponent 0) at 0.5612 → 56120 paise", () => {
    expect(exponent("JPY")).toBe(0);
    expect(convertMinor(1000, "JPY", "INR", "0.5612")).toBe(56120);
  });
  it("normalizes rates to ≤ 10 decimals and rejects zero/invalid", () => {
    expect(normalizeRate(95.98)).toBe("95.98");
    expect(normalizeRate("0.012300")).toBe("0.0123");
    expect(normalizeRate("1.123456789012")).toBe("1.123456789");
    expect(normalizeRate("0")).toBeNull();
    expect(normalizeRate("-1")).toBeNull();
    expect(normalizeRate("abc")).toBeNull();
  });
});

describe("Frankfurter v2 adapter (R16, P1-7 shape)", () => {
  it("builds the v2 URL and parses the response", () => {
    expect(frankfurterRateUrl("USD", "INR", "2026-10-01")).toBe("https://api.frankfurter.dev/v2/rate/USD/INR?date=2026-10-01");
    expect(frankfurterRateUrl("USD", "INR", null)).toBe("https://api.frankfurter.dev/v2/rate/USD/INR");
    expect(parseFrankfurterRate({ date: "2026-10-01", base: "USD", quote: "INR", rate: 95.98 }, "USD", "INR")).toEqual({
      rate: "95.98",
      sourceDate: "2026-10-01",
    });
    expect(parseFrankfurterRate({ status: 422, message: "invalid currency" }, "USD", "INR")).toBeNull();
    expect(parseFrankfurterRate({ date: "2026-10-01", base: "EUR", quote: "INR", rate: 1 }, "USD", "INR")).toBeNull();
  });
  it("identity for the base currency, without a network call (R15)", async () => {
    const { d, calls } = deps();
    expect(await getRate({ date: "2026-10-01", from: "INR", to: "INR" }, d)).toEqual({
      ok: true,
      rate: "1",
      rateDate: "2026-10-01",
      source: "identity",
    });
    expect(calls).toEqual([]);
  });
  it("fetches once, then serves from the cache", async () => {
    const { d, calls } = deps();
    const a = await getRate({ date: "2026-10-01", from: "USD", to: "INR" }, d);
    const b = await getRate({ date: "2026-10-01", from: "USD", to: "INR" }, d);
    expect(a).toEqual({ ok: true, rate: "95.98", rateDate: "2026-10-01", source: "frankfurter" });
    expect(b).toEqual(a);
    expect(calls).toHaveLength(1);
  });
  it("requests the latest rate for a future date (D-17) and does not cache it", async () => {
    const { d, calls, cache } = deps();
    await getRate({ date: "2026-12-01", from: "USD", to: "INR" }, d);
    expect(calls).toEqual(["https://api.frankfurter.dev/v2/rate/USD/INR"]);
    expect(cache.size).toBe(0);
  });
  it("AC-7: a timed-out fetch with an empty cache → RATE_UNAVAILABLE", async () => {
    const { d } = deps({
      fetchJson: (_url, signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    });
    expect(await getRate({ date: "2026-10-01", from: "USD", to: "INR" }, d, 20)).toEqual({
      ok: false,
      error: "RATE_UNAVAILABLE",
    });
  });
  it("AC-7: a manual rate is accepted with source = manual and used for conversion (R18)", () => {
    const m = manualRate("83.5", "2026-10-01");
    expect(m).toEqual({ ok: true, rate: "83.5", rateDate: "2026-10-01", source: "manual" });
    expect(convertMinor(1000, "USD", "INR", "83.5")).toBe(83500);
    expect(manualRate("0", "2026-10-01")).toBeNull();
    expect(manualRate("1.12345678901", "2026-10-01")).toBeNull();
    expect(manualRate("abc", "2026-10-01")).toBeNull();
  });
  it("todayIST uses Asia/Kolkata", () => {
    expect(todayIST(new Date("2026-10-15T19:00:00Z"))).toBe("2026-10-16");
    expect(todayIST(new Date("2026-10-15T18:00:00Z"))).toBe("2026-10-15");
  });
});
