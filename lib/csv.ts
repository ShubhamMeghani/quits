// CSV export (R43): UTF-8 BOM, RFC 4180 quoting, formula-injection guard.
import { minorToMajorString, type Minor } from "./money";
import { exponent } from "./currency";

export const CSV_BASE_COLUMNS = [
  "type",
  "date",
  "description",
  "category",
  "notes",
  "currency",
  "amount",
  "fx_rate",
  "base_currency",
  "base_amount",
  "paid_by",
] as const;

export type CsvMember = { id: string; name: string };

export type CsvExpense = {
  date: string;
  description: string;
  category: string;
  notes: string | null;
  currency: string;
  amountMinor: Minor;
  fxRate: string;
  baseAmountMinor: Minor;
  payers: { memberId: string; amountMinor: Minor }[];
  owedBase: Record<string, Minor>;
  deleted?: boolean;
};

export type CsvSettlement = {
  date: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: Minor;
  note: string | null;
  deleted?: boolean;
};

/** Guards against spreadsheet formula injection: cells starting with = + - @ tab CR get a leading '. */
export function guardCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote when the cell contains comma, quote, CR or LF; double inner quotes. */
export function quoteCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const cell = (v: string) => quoteCell(guardCell(v));

export function buildCsv(params: {
  members: readonly CsvMember[];
  baseCurrency: string;
  expenses: readonly CsvExpense[];
  settlements: readonly CsvSettlement[];
}): string {
  const { members, baseCurrency } = params;
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const eBase = exponent(baseCurrency);
  const header = [...CSV_BASE_COLUMNS, ...members.map((m) => `owes:${m.name}`)];

  type Row = { date: string; order: number; cells: string[] };
  const rows: Row[] = [];
  params.expenses.forEach((e, order) => {
    if (e.deleted) return;
    const eSrc = exponent(e.currency);
    const paidBy =
      e.payers.length === 1
        ? (nameOf.get(e.payers[0].memberId) ?? "")
        : e.payers.map((p) => `${nameOf.get(p.memberId) ?? ""} (${minorToMajorString(p.amountMinor, eSrc)})`).join("; ");
    rows.push({
      date: e.date,
      order,
      cells: [
        "expense",
        e.date,
        e.description,
        e.category,
        e.notes ?? "",
        e.currency,
        minorToMajorString(e.amountMinor, eSrc),
        e.fxRate,
        baseCurrency,
        minorToMajorString(e.baseAmountMinor, eBase),
        paidBy,
        ...members.map((m) => (m.id in e.owedBase ? minorToMajorString(e.owedBase[m.id], eBase) : "")),
      ],
    });
  });
  params.settlements.forEach((s, i) => {
    if (s.deleted) return;
    const from = nameOf.get(s.fromMemberId) ?? "";
    const to = nameOf.get(s.toMemberId) ?? "";
    const amount = minorToMajorString(s.amountMinor, eBase);
    rows.push({
      date: s.date,
      order: params.expenses.length + i,
      cells: ["settlement", s.date, `${from} paid ${to}`, "", s.note ?? "", baseCurrency, amount, "1", baseCurrency, amount, from, ...members.map(() => "")],
    });
  });
  rows.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  const lines = [header, ...rows.map((r) => r.cells)].map((cells) => cells.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "group";
}

export function csvFilename(groupName: string, date: string): string {
  return `quits-${slugify(groupName)}-${date}.csv`;
}
