// Display helpers (R51): en-IN money, IST dates. Safe on server and client.
import { exponent } from "@/lib/currency";
import { formatMoney, type Minor } from "@/lib/money";

export function money(minor: Minor, currency: string): string {
  return formatMoney(minor, currency, exponent(currency));
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** "2026-10-16" → "16 Oct 2026" (calendar dates are already IST dates). */
export function formatDate(date: string): string {
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}

/** ISO timestamp → "16 Oct, 14:05" in IST. */
export function formatTimestamp(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "gets back ₹X" / "owes ₹X" / "settled up" — words, not colour alone (R51). */
export function balanceWords(balance: Minor, currency: string): string {
  if (balance > 0) return `gets back ${money(balance, currency)}`;
  if (balance < 0) return `owes ${money(-balance, currency)}`;
  return "settled up";
}
