// Activity summaries (R42): human-readable, with `old → new` for every changed field.
import { formatMoney, type Minor } from "@/lib/money";
import { exponent } from "@/lib/currency";

export type ExpenseSnapshot = {
  description: string;
  amountMinor: Minor;
  currency: string;
  expenseDate: string;
  category: string;
  notes: string | null;
  splitType: string;
  payers: { memberId: string; amountMinor: Minor }[];
  splits: { memberId: string; owedMinor: Minor }[];
};

const money = (minor: Minor, currency: string) => formatMoney(minor, currency, exponent(currency));

function payersText(s: ExpenseSnapshot, names: ReadonlyMap<string, string>): string {
  if (s.payers.length === 1) return names.get(s.payers[0].memberId) ?? "?";
  return s.payers.map((p) => `${names.get(p.memberId) ?? "?"} ${money(p.amountMinor, s.currency)}`).join(", ");
}

function splitKey(s: ExpenseSnapshot): string {
  return `${s.splitType}|${s.splits.map((x) => `${x.memberId}:${x.owedMinor}`).join(",")}`;
}

/** One entry per changed field, e.g. "Amount ₹500.00 → ₹600.00". */
export function expenseChanges(before: ExpenseSnapshot, after: ExpenseSnapshot, names: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  if (before.description !== after.description) out.push(`Description "${before.description}" → "${after.description}"`);
  if (before.amountMinor !== after.amountMinor || before.currency !== after.currency) {
    out.push(`Amount ${money(before.amountMinor, before.currency)} → ${money(after.amountMinor, after.currency)}`);
  }
  if (before.expenseDate !== after.expenseDate) out.push(`Date ${before.expenseDate} → ${after.expenseDate}`);
  if (before.category !== after.category) out.push(`Category ${before.category} → ${after.category}`);
  if ((before.notes ?? "") !== (after.notes ?? "")) {
    out.push(`Notes "${before.notes ?? ""}" → "${after.notes ?? ""}"`);
  }
  const pb = payersText(before, names);
  const pa = payersText(after, names);
  if (pb !== pa) out.push(`Paid by ${pb} → ${pa}`);
  if (splitKey(before) !== splitKey(after)) {
    out.push(before.splitType !== after.splitType ? `Split ${before.splitType} → ${after.splitType}` : "Split shares changed");
  }
  return out;
}

export const summaries = {
  expenseCreated: (s: ExpenseSnapshot) => `Added "${s.description}" ${money(s.amountMinor, s.currency)}`,
  expenseUpdated: (before: ExpenseSnapshot, after: ExpenseSnapshot, names: ReadonlyMap<string, string>) => {
    const changes = expenseChanges(before, after, names);
    return `Edited "${after.description}": ${changes.length ? changes.join("; ") : "no changes"}`;
  },
  expenseDeleted: (s: ExpenseSnapshot) => `Deleted "${s.description}" ${money(s.amountMinor, s.currency)}`,
  expenseRestored: (s: ExpenseSnapshot) => `Restored "${s.description}" ${money(s.amountMinor, s.currency)}`,
  settlementCreated: (from: string, to: string, amount: Minor, currency: string, method: string) =>
    `Recorded payment: ${from} paid ${to} ${money(amount, currency)}${method === "upi" ? " via UPI" : method === "cash" ? " in cash" : ""}`,
  settlementDeleted: (from: string, to: string, amount: Minor, currency: string) =>
    `Deleted payment: ${from} paid ${to} ${money(amount, currency)}`,
  settlementRestored: (from: string, to: string, amount: Minor, currency: string) =>
    `Restored payment: ${from} paid ${to} ${money(amount, currency)}`,
  memberAdded: (name: string) => `Added ${name} to the group`,
  memberUpdated: (before: { name: string; upiId: string | null }, after: { name: string; upiId: string | null }) => {
    const parts: string[] = [];
    if (before.name !== after.name) parts.push(`Name ${before.name} → ${after.name}`);
    if ((before.upiId ?? "") !== (after.upiId ?? "")) {
      parts.push(after.upiId ? `UPI ID ${before.upiId ?? "none"} → ${after.upiId}` : "UPI ID removed");
    }
    return `Updated ${after.name}: ${parts.length ? parts.join("; ") : "no changes"}`;
  },
  memberArchived: (name: string) => `Archived ${name}`,
  groupUpdated: (changes: string[]) => `Updated group settings: ${changes.length ? changes.join("; ") : "no changes"}`,
};
