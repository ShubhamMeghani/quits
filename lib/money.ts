// Money as integer minor units (R13). No floating-point in any split,
// balance or allocation math: weights and totals go through BigInt.

export type Minor = number;

export function isMinor(n: unknown): n is Minor {
  return typeof n === "number" && Number.isSafeInteger(n);
}

export function assertMinor(n: number, label = "amount"): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be an integer number of minor units`);
}

/**
 * Largest-remainder allocation (R13).
 * 1. Each entry gets floor(total × wᵢ / Σw).
 * 2. Leftover units go one at a time to the largest fractional remainders.
 * 3. Ties go to the earlier entry, so callers pass entries in member order.
 * A negative total is allocated as |total| and negated.
 */
export function allocate(total: Minor, weights: readonly (number | bigint)[]): Minor[] {
  assertMinor(total, "total");
  if (weights.length === 0) throw new Error("allocate: no weights");
  if (total < 0) return allocate(-total, weights).map((v) => (v === 0 ? 0 : -v));

  const w = weights.map((x) => {
    const b = BigInt(x);
    if (b < 0n) throw new Error("allocate: negative weight");
    return b;
  });
  const sumW = w.reduce((a, b) => a + b, 0n);
  if (sumW === 0n) throw new Error("allocate: weights sum to zero");

  const t = BigInt(total);
  const floors = w.map((wi) => (t * wi) / sumW);
  const rems = w.map((wi) => (t * wi) % sumW);
  let leftover = Number(t - floors.reduce((a, b) => a + b, 0n));

  const order = rems
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = floors.map((f) => Number(f));
  for (const { i } of order) {
    if (leftover <= 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out;
}

/** n / d rounded half away from zero (half-up for non-negative values). */
export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("divRoundHalfUp: divisor must be positive");
  if (n < 0n) return -divRoundHalfUp(-n, d);
  return (2n * n + d) / (2n * d);
}

/** Parses a plain decimal string ("-12.345") into a scaled BigInt and its scale. */
export function parseDecimal(value: string): { int: bigint; scale: number } | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = m[3] ?? "";
  const int = BigInt(m[2] + frac) * (m[1] === "-" ? -1n : 1n);
  return { int, scale: frac.length };
}

function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) throw new Error("not a finite number");
  const s = String(value);
  if (!/e/i.test(s)) return s;
  return value.toFixed(12).replace(/\.?0+$/, "");
}

/** Converts a major-unit decimal (number or string) to minor units, rounding half-up. */
export function decimalToMinor(value: number | string, exponent: number): Minor {
  const str = typeof value === "number" ? numberToDecimalString(value) : value;
  const d = parseDecimal(str);
  if (!d) throw new Error(`invalid decimal: ${str}`);
  const scaled =
    d.scale <= exponent
      ? d.int * 10n ** BigInt(exponent - d.scale)
      : divRoundHalfUp(d.int, 10n ** BigInt(d.scale - exponent));
  const n = Number(scaled);
  assertMinor(n);
  return n;
}

/**
 * Parses user input such as "1,240.50" or "₹ 99" into minor units.
 * Returns null when the input is not a number or has more decimals than the currency allows.
 */
export function parseMajorInput(input: string, exponent: number): Minor | null {
  const cleaned = input.replace(/[\s,₹]/g, "");
  if (!/^-?\d+(\.\d*)?$/.test(cleaned)) return null;
  const [, frac = ""] = cleaned.split(".");
  if (frac.length > exponent) return null;
  return decimalToMinor(cleaned.replace(/\.$/, ""), exponent);
}

/** Minor units → plain major string with exactly `exponent` decimals ("450.50"). */
export function minorToMajorString(minor: Minor, exponent: number): string {
  assertMinor(minor);
  const neg = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exponent + 1, "0");
  const intPart = exponent === 0 ? digits : digits.slice(0, -exponent);
  const fracPart = exponent === 0 ? "" : "." + digits.slice(-exponent);
  return (neg ? "-" : "") + intPart + fracPart;
}

/** en-IN currency formatting, e.g. ₹1,23,456.78 (R51). */
export function formatMoney(minor: Minor, currency: string, exponent: number): string {
  const fmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  // Intl accepts decimal strings, which keeps the display exact.
  return fmt.format(minorToMajorString(minor, exponent) as unknown as number);
}

export function sum(values: readonly Minor[]): Minor {
  let s = 0;
  for (const v of values) s += v;
  assertMinor(s, "sum");
  return s;
}
