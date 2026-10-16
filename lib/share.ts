// WhatsApp share and nudge text (SPEC v0.7 R68–R70, §4.3; D-22: "₹", not "Rs").
// Quits never stores phone numbers: the user picks the contact inside WhatsApp.
import { exponent } from "./currency";
import { formatMoney, minorToMajorString, type Minor } from "./money";

/** Indian digit grouping: 120000 → "1,20,000". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** "₹1,200" for whole rupees, "₹1,200.50" otherwise; other currencies use the app's formatting. */
export function shareAmount(minor: Minor, currency = "INR"): string {
  if (currency !== "INR") return formatMoney(minor, currency, exponent(currency));
  const s = minorToMajorString(Math.abs(minor), 2);
  const [rupees, paise] = s.split(".");
  return `${minor < 0 ? "-" : ""}₹${groupIndian(rupees)}${paise === "00" ? "" : `.${paise}`}`;
}

export type SharePayment = { from: string; to: string; amountMinor: Minor };

/** R68: the settle-up summary. */
export function summaryMessage(p: { groupName: string; payments: readonly SharePayment[]; link: string; currency?: string }): string {
  const lines = [`Quits: ${p.groupName}`];
  if (p.payments.length === 0) lines.push("Everyone is settled up.");
  else {
    lines.push("Payments to settle up:");
    for (const x of p.payments) lines.push(`- ${x.from} -> ${x.to} ${shareAmount(x.amountMinor, p.currency)}`);
  }
  lines.push(`Open the group: ${p.link}`);
  return lines.join("\n");
}

/** R69: a polite reminder for one suggested payment. */
export function reminderMessage(p: { from: string; to: string; amountMinor: Minor; groupName: string; link: string; currency?: string }): string {
  return `Hi ${p.from}, a gentle reminder from Quits: please pay ${p.to} ${shareAmount(p.amountMinor, p.currency)} for "${p.groupName}". You can scan the UPI QR in the group: ${p.link} Thanks!`;
}

/** R68/R69: a wa.me link that opens WhatsApp with the text prefilled (no phone number). */
export function waLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
