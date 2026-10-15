// Recurring expenses (R44–R46): occurrence dates, month-end clamping, idempotent catch-up.

export type Frequency = "weekly" | "monthly";

export type RecurringRule = {
  frequency: Frequency;
  anchorDate: string; // YYYY-MM-DD; first occurrence
  nextDue: string; // first occurrence not yet created
  endDate: string | null;
  active: boolean;
};

export const MAX_CATCH_UP = 24;

function parse(date: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`invalid date: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The k-th occurrence (k = 0 is the anchor). Monthly uses the anchor's day, clamped to month end. */
export function occurrenceAt(rule: Pick<RecurringRule, "frequency" | "anchorDate">, k: number): string {
  if (rule.frequency === "weekly") return addDays(rule.anchorDate, 7 * k);
  const { y, m, d } = parse(rule.anchorDate);
  const monthIndex = m - 1 + k;
  const yy = y + Math.floor(monthIndex / 12);
  const mm = (((monthIndex % 12) + 12) % 12) + 1;
  return fmt(yy, mm, Math.min(d, daysInMonth(yy, mm)));
}

/**
 * Occurrences due on or before `today` (and `endDate`) that are not yet created, starting at
 * `nextDue`; at most MAX_CATCH_UP. Returns the new `nextDue` after those occurrences.
 */
export function occurrencesDue(
  rule: RecurringRule,
  today: string,
  alreadyCreated: ReadonlySet<string> = new Set(),
  cap = MAX_CATCH_UP,
): { dates: string[]; nextDue: string } {
  if (!rule.active) return { dates: [], nextDue: rule.nextDue };
  const limit = rule.endDate && rule.endDate < today ? rule.endDate : today;
  const dates: string[] = [];
  let nextDue = rule.nextDue;
  for (let k = 0; k < 10_000; k++) {
    const date = occurrenceAt(rule, k);
    if (date < rule.nextDue) continue;
    if (date > limit || dates.length >= cap) {
      nextDue = date;
      break;
    }
    if (!alreadyCreated.has(date)) dates.push(date);
    nextDue = occurrenceAt(rule, k + 1);
  }
  return { dates, nextDue };
}
