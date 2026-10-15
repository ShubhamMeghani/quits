// Currencies, exact conversion and the Frankfurter v2 adapter (R15–R18).
import { z } from "zod";
import { allocate, divRoundHalfUp, parseDecimal, type Minor } from "./money";

/** Supported currencies: a subset of Frankfurter's /v2/currencies list (SPEC §4.3). */
export const SUPPORTED_CURRENCIES = [
  { code: "INR", name: "Indian Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KRW", name: "South Korean Won" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "ISK", name: "Icelandic Krona" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const CODES = new Set<string>(SUPPORTED_CURRENCIES.map((c) => c.code));
const ZERO_DECIMAL = new Set(["JPY", "KRW", "ISK"]);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CODES.has(code);
}

/** ISO 4217 minor-unit exponent: JPY, KRW, ISK → 0; all other supported currencies → 2. */
export function exponent(code: string): number {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}

const RATE_RE = /^\d{1,10}(\.\d{1,10})?$/;

/** A rate is a positive decimal string with at most 10 decimals (numeric(20,10)). */
export function normalizeRate(rate: string | number): string | null {
  let s = typeof rate === "number" ? String(rate) : rate.trim();
  if (/e/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    s = n.toFixed(10);
  }
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, 10).replace(/0+$/, "");
  const out = frac ? `${m[1].replace(/^0+(?=\d)/, "")}.${frac}` : m[1].replace(/^0+(?=\d)/, "");
  if (!RATE_RE.test(out) || /^0(\.0*)?$/.test(out)) return null;
  return out;
}

/**
 * R17: base = round_half_up(amount × rate × 10^(exp_base − exp_src)), using exact decimals.
 */
export function convertMinor(amountMinor: Minor, from: string, to: string, rate: string): Minor {
  const r = parseDecimal(rate);
  if (!r || r.int <= 0n) throw new Error(`invalid rate: ${rate}`);
  const eFrom = exponent(from);
  const eTo = exponent(to);
  const num = BigInt(amountMinor) * r.int * 10n ** BigInt(eTo);
  const den = 10n ** BigInt(r.scale + eFrom);
  return Number(divRoundHalfUp(num, den));
}

/**
 * Converts an expense's total, then derives payer/split base amounts by allocating the
 * converted total in proportion to their original-currency amounts (R17), so sums stay exact.
 */
export function convertParts(
  totalMinor: Minor,
  parts: readonly Minor[],
  from: string,
  to: string,
  rate: string,
): { baseTotal: Minor; baseParts: Minor[] } {
  const baseTotal = from === to ? totalMinor : convertMinor(totalMinor, from, to, rate);
  if (parts.length === 0) return { baseTotal, baseParts: [] };
  if (parts.every((p) => p === 0)) return { baseTotal, baseParts: parts.map(() => 0) };
  return { baseTotal, baseParts: allocate(baseTotal, parts.map((p) => Math.abs(p))) };
}

// ---------- Frankfurter v2 adapter (confirmed in Phase 1, P1-7) ----------
// GET https://api.frankfurter.dev/v2/rate/{BASE}/{QUOTE}?date=YYYY-MM-DD
//   → {"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}
// Weekend dates return a blended rate for that date. Future dates return 404,
// so dates after today request the latest rate (no date parameter).

export const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2";

export function frankfurterRateUrl(base: string, quote: string, date: string | null): string {
  const url = `${FRANKFURTER_BASE_URL}/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`;
  return date ? `${url}?date=${date}` : url;
}

const frankfurterRateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive(),
});

export function parseFrankfurterRate(
  json: unknown,
  base: string,
  quote: string,
): { rate: string; sourceDate: string } | null {
  const parsed = frankfurterRateSchema.safeParse(json);
  if (!parsed.success) return null;
  const { data } = parsed;
  if (data.base.toUpperCase() !== base || data.quote.toUpperCase() !== quote) return null;
  const rate = normalizeRate(data.rate);
  return rate ? { rate, sourceDate: data.date } : null;
}

export type RateSource = "identity" | "frankfurter" | "manual";

export type RateResult =
  | { ok: true; rate: string; rateDate: string; source: RateSource }
  | { ok: false; error: "RATE_UNAVAILABLE" };

export type CachedRate = { rate: string; sourceDate: string };

export interface RateDeps {
  /** Cache lookup keyed by the requested date (fx_rates). */
  cacheGet(date: string, base: string, quote: string): Promise<CachedRate | null>;
  cacheSet(date: string, base: string, quote: string, value: CachedRate): Promise<void>;
  /** Fetches JSON; must reject on non-2xx or abort. */
  fetchJson(url: string, signal: AbortSignal): Promise<unknown>;
  /** Today's IST date (YYYY-MM-DD). */
  today(): string;
}

/**
 * R15/R16/R18: identity for the base currency; otherwise cache, then Frankfurter
 * (5 s timeout). Failure with no cached rate → RATE_UNAVAILABLE (the UI asks for a manual rate).
 */
export async function getRate(
  params: { date: string; from: string; to: string },
  deps: RateDeps,
  timeoutMs = 5000,
): Promise<RateResult> {
  const { date, from, to } = params;
  if (from === to) return { ok: true, rate: "1", rateDate: date, source: "identity" };

  try {
    const cached = await deps.cacheGet(date, from, to);
    if (cached) return { ok: true, rate: cached.rate, rateDate: cached.sourceDate, source: "frankfurter" };
  } catch {
    // cache miss on error; fall through to the network
  }

  const isFuture = date > deps.today();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const json = await deps.fetchJson(frankfurterRateUrl(from, to, isFuture ? null : date), controller.signal);
    const parsed = parseFrankfurterRate(json, from, to);
    if (!parsed) return { ok: false, error: "RATE_UNAVAILABLE" };
    if (!isFuture) {
      await deps.cacheSet(date, from, to, parsed).catch(() => undefined);
    }
    return { ok: true, rate: parsed.rate, rateDate: parsed.sourceDate, source: "frankfurter" };
  } catch {
    return { ok: false, error: "RATE_UNAVAILABLE" };
  } finally {
    clearTimeout(timer);
  }
}

/** R18: validates a manually entered rate (> 0, ≤ 10 decimals). */
export function manualRate(input: string, date: string): RateResult | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,10})?$/.test(trimmed)) return null;
  const rate = normalizeRate(trimmed);
  return rate ? { ok: true, rate, rateDate: date, source: "manual" } : null;
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
