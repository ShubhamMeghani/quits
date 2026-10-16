import "server-only";
import { getRate, manualRate, todayIST, type RateDeps, type RateResult } from "@/lib/currency";
import { db } from "@/server/db";
import { AppError, invalid } from "@/server/errors";

/** RateDeps backed by the fx_rates cache table and fetch (R16). */
export function serverRateDeps(): RateDeps {
  return {
    async cacheGet(date, base, quote) {
      const { data } = await db()
        .from("fx_rates")
        .select("rate::text, source_date")
        .eq("rate_date", date)
        .eq("base", base)
        .eq("quote", quote)
        .maybeSingle<{ rate: string; source_date: string }>();
      if (!data) return null;
      const rate = data.rate.includes(".") ? data.rate.replace(/0+$/, "").replace(/\.$/, "") : data.rate;
      return { rate, sourceDate: data.source_date };
    },
    async cacheSet(date, base, quote, value) {
      await db()
        .from("fx_rates")
        .upsert({ rate_date: date, base, quote, rate: value.rate, source_date: value.sourceDate });
    },
    async fetchJson(url, signal) {
      if (process.env.FX_FORCE_FAIL === "1") throw new Error("FX_FORCE_FAIL");
      const res = await fetch(url, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    today: () => todayIST(),
  };
}

export type ResolvedRate = { rate: string; rateDate: string; source: "identity" | "frankfurter" | "manual" };

/**
 * R15–R18: identity for the base currency; a valid manual rate if supplied; else cache/Frankfurter.
 * Throws RATE_UNAVAILABLE (the form then asks for a manual rate).
 */
export async function resolveRate(params: {
  date: string;
  currency: string;
  baseCurrency: string;
  manual?: string | null;
}): Promise<ResolvedRate> {
  const { date, currency, baseCurrency, manual } = params;
  if (currency === baseCurrency) return { rate: "1", rateDate: date, source: "identity" };
  if (manual) {
    const m = manualRate(manual, date);
    if (!m || !m.ok) throw invalid("Enter a valid exchange rate (more than 0, up to 10 decimals)");
    return { rate: m.rate, rateDate: date, source: "manual" };
  }
  const r: RateResult = await getRate({ date, from: currency, to: baseCurrency }, serverRateDeps());
  if (!r.ok) {
    throw new AppError("RATE_UNAVAILABLE", 422, `Couldn't fetch the ${currency}→${baseCurrency} rate. Enter it manually.`);
  }
  return { rate: r.rate, rateDate: r.rateDate, source: r.source };
}
