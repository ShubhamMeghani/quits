import { allocate, type Minor } from "./money";

/**
 * POLISH-1: each value's share of the total, in percent with one decimal place.
 * The shares are allocated in tenths of a percent with R13's largest-remainder rule, so the
 * displayed figures always add up to exactly 100.0% (ties go to the earlier entry). A total of
 * zero gives 0 for every entry.
 */
export function percentShares(values: readonly Minor[]): number[] {
  if (values.length === 0) return [];
  if (values.some((v) => v < 0)) throw new Error("percentShares: negative value");
  if (values.every((v) => v === 0)) return values.map(() => 0);
  return allocate(1000, values).map((tenths) => tenths / 10);
}

/** "45.2%" */
export const formatPercent = (p: number) => `${p.toFixed(1)}%`;
