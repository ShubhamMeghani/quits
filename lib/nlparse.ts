// Type-to-add (SPEC v0.7, R61–R66): the model contract and deterministic post-processing.
// The model only reads the sentence; member matching and every validation happen here, and
// anything unclear is left blank and flagged (never guessed, never a new member).
import { z } from "zod";
import { decimalToMinor, minorToMajorString, type Minor } from "./money";
import { exponent, isSupportedCurrency } from "./currency";
import { CATEGORIES, computeSplit, percentToBasisPoints, type Category, type SplitInput } from "./splits";
import { addDays } from "./recurring";

export const NL_MAX_CHARS = 300;
const MAX_MAJOR = 10_000_000;

/** Words that mean the current member (R62, D-24: matched here, not left to Gemini). */
export const ME_WORDS: ReadonlySet<string> = new Set(["me", "i", "main", "maine", "mujhe", "mera"]);
/** Words that mean every active member (D-23; "sab mein" = among everyone). */
export const ALL_WORDS: ReadonlySet<string> = new Set(["everyone", "everybody", "all", "all of us", "sab", "sabhi", "sab log", "hum sab"]);

// ---------- Model contract (SPEC §4.3) ----------

export const NL_PROMPT = `You turn one short sentence about a shared expense (English or Hinglish) into JSON. Return JSON only.
Rules:
- Use only information in the sentence. If something is not stated, use null (or [] for lists). Never invent names.
- Names: copy each person's name exactly as written. Use "me" for the speaker (I, me, my, maine, mujhe, mera, main).
- If the sentence says everyone / all / sab / sabhi, list every member name given.
- "X paid N, split with A and B" includes X among the participants unless the text says otherwise ("only for A and B").
- If the sentence lists shares or amounts per person, only those people take part (do not add the payer). A "treat" means the payer covers it all: the payer is the only participant.
- amount: the total paid, as a number in major units (e.g. 600 or 249.50). currency: ISO 4217 if stated, else null.
- split_type: "equal" when split evenly or not stated; "exact" for amounts per person; "percent" for percentages; "shares" for ratios like 2:1:1.
  split_values: [{name, value}] only for exact (amount), percent (number) or shares (integer); [] for equal.
- category: one of: ${CATEGORIES.join(", ")}; or null.
- date: YYYY-MM-DD, resolved from "today" given below (e.g. yesterday, on Friday); null if not stated.
- description: a short title (e.g. "Pizza", "Auto"), or null.`;

export const NL_JSON_SCHEMA = {
  type: "object",
  properties: {
    description: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    payer: { type: ["string", "null"] },
    participants: { type: "array", items: { type: "string" } },
    split_type: { type: ["string", "null"], enum: ["equal", "exact", "percent", "shares", null] },
    split_values: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, value: { type: "number" } }, required: ["name", "value"] },
    },
    category: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
  },
  required: ["description", "amount", "currency", "payer", "participants", "split_type", "split_values", "category", "date"],
} as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The user turn sent with the prompt: context plus the sentence (R61). */
export function nlUserText(text: string, ctx: { memberNames: readonly string[]; baseCurrency: string; today: string }): string {
  const weekday = WEEKDAYS[new Date(`${ctx.today}T00:00:00Z`).getUTCDay()];
  return [
    `Members: ${ctx.memberNames.map(firstName).join(", ")}`,
    `Base currency: ${ctx.baseCurrency}`,
    `Today: ${ctx.today} (${weekday})`,
    `Sentence: """${text.slice(0, NL_MAX_CHARS)}"""`,
  ].join("\n");
}

const nullable = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === undefined ? null : v), t.nullable());

export const nlModelSchema = z.object({
  description: nullable(z.string()),
  amount: nullable(z.number()),
  currency: nullable(z.string()),
  payer: nullable(z.string()),
  participants: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.string())),
  split_type: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : null), z.enum(["equal", "exact", "percent", "shares"]).nullable()),
  split_values: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.object({ name: z.string(), value: z.number() }))),
  category: nullable(z.string()),
  date: nullable(z.string()),
});
export type NlModel = z.infer<typeof nlModelSchema>;

export function parseNlModel(raw: unknown): NlModel | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = nlModelSchema.safeParse(value);
  return r.success ? r.data : null;
}

// ---------- Name matching (R62) ----------

export type NlMember = { id: string; name: string };

export type NlContext = {
  /** Active members in display order. */
  members: readonly NlMember[];
  /** The current member (who "me" means), or null. */
  meId: string | null;
  baseCurrency: string;
  /** IST date, YYYY-MM-DD. */
  today: string;
};

export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;

export type NameMatch =
  | { kind: "member"; id: string }
  | { kind: "all" }
  | { kind: "unknown" | "ambiguous" | "no-me"; raw: string };

/** Case-insensitive match against full or first names; never creates a member. */
export function matchName(raw: string, ctx: NlContext): NameMatch {
  const n = normalizeName(raw);
  if (!n) return { kind: "unknown", raw };
  if (ME_WORDS.has(n)) return ctx.meId ? { kind: "member", id: ctx.meId } : { kind: "no-me", raw };
  if (ALL_WORDS.has(n)) return { kind: "all" };
  const full = ctx.members.filter((m) => normalizeName(m.name) === n);
  if (full.length === 1) return { kind: "member", id: full[0].id };
  const first = ctx.members.filter((m) => normalizeName(firstName(m.name)) === n);
  const hits = full.length > 1 ? full : first;
  if (hits.length === 1) return { kind: "member", id: hits[0].id };
  return hits.length > 1 ? { kind: "ambiguous", raw } : { kind: "unknown", raw };
}

// ---------- Resolution and validation (R63) ----------

export type NlField = "description" | "amount" | "currency" | "payer" | "participants" | "split" | "category" | "date";
export type NlFlag = { field: NlField; reason: "missing" | "unknown" | "ambiguous" | "invalid" | "no-me"; value?: string };
export type NlSplitType = "equal" | "exact" | "percent" | "shares";

export type NlPrefill = {
  description: string | null;
  amountMinor: Minor | null;
  currency: string;
  payerId: string | null;
  splitType: NlSplitType;
  /** Member ids; [] means "not stated" (the form keeps its default). */
  participantIds: string[];
  /** Form strings per member for exact/percent/shares; null when blank. */
  splitValues: Record<string, string> | null;
  category: Category | null;
  date: string | null;
};

export type NlResult = { prefill: NlPrefill; flags: NlFlag[] };

function bpsToPercentString(bp: number): string {
  return minorToMajorString(bp, 2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function resolveNl(model: NlModel, ctx: NlContext): NlResult {
  const flags: NlFlag[] = [];
  const order = ctx.members.map((m) => m.id);
  const rank = new Map(order.map((id, i) => [id, i]));
  const sortIds = (ids: Iterable<string>) => [...new Set(ids)].sort((a, b) => rank.get(a)! - rank.get(b)!);

  const description = model.description?.trim() ? model.description.trim().slice(0, 100) : null;

  // Currency: supported, else the base currency.
  const rawCur = model.currency?.trim().toUpperCase() ?? null;
  const currency = rawCur && isSupportedCurrency(rawCur) ? rawCur : ctx.baseCurrency;
  if (rawCur && currency !== rawCur) flags.push({ field: "currency", reason: "invalid", value: model.currency! });
  const exp = exponent(currency);

  // Amount: > 0 and within the R8 maximum.
  let amountMinor: Minor | null = null;
  if (model.amount === null) flags.push({ field: "amount", reason: "missing" });
  else if (!Number.isFinite(model.amount) || model.amount <= 0 || model.amount > MAX_MAJOR) flags.push({ field: "amount", reason: "invalid", value: String(model.amount) });
  else {
    amountMinor = decimalToMinor(model.amount, exp);
    if (amountMinor <= 0) {
      amountMinor = null;
      flags.push({ field: "amount", reason: "invalid", value: String(model.amount) });
    }
  }

  // Payer: exactly one member.
  let payerId: string | null = null;
  if (!model.payer?.trim()) flags.push({ field: "payer", reason: "missing" });
  else {
    const m = matchName(model.payer, ctx);
    if (m.kind === "member") payerId = m.id;
    else if (m.kind === "all") flags.push({ field: "payer", reason: "invalid", value: model.payer });
    else flags.push({ field: "payer", reason: m.kind, value: model.payer });
  }

  // Participants: matched members only; any unmatched name blanks the split values (R63).
  let participantsIncomplete = false;
  const participants: string[] = [];
  for (const raw of model.participants) {
    const m = matchName(raw, ctx);
    if (m.kind === "member") participants.push(m.id);
    else if (m.kind === "all") participants.push(...order);
    else {
      participantsIncomplete = true;
      flags.push({ field: "participants", reason: m.kind, value: raw });
    }
  }

  // Split.
  const splitType: NlSplitType = model.split_type ?? "equal";
  let splitValues: Record<string, string> | null = null;
  let participantIds = sortIds(participants);
  if (splitType !== "equal") {
    const values = new Map<string, number>();
    let bad = participantsIncomplete;
    for (const v of model.split_values) {
      const m = matchName(v.name, ctx);
      if (m.kind !== "member") {
        bad = true;
        if (m.kind !== "all") flags.push({ field: "participants", reason: m.kind, value: v.name });
        continue;
      }
      values.set(m.id, (values.get(m.id) ?? 0) + v.value);
    }
    if (values.size === 0) bad = true;
    let input: SplitInput | null = null;
    if (!bad) {
      const ids = sortIds(values.keys());
      if (splitType === "exact") {
        const amounts: Record<string, number> = {};
        for (const id of ids) {
          const v = values.get(id)!;
          if (!(v >= 0)) bad = true;
          else amounts[id] = decimalToMinor(v, exp);
        }
        input = { type: "exact", amounts };
      } else if (splitType === "percent") {
        const bp: Record<string, number> = {};
        for (const id of ids) {
          const b = percentToBasisPoints(String(Math.round(values.get(id)! * 100) / 100));
          if (b === null) bad = true;
          else bp[id] = b;
        }
        input = { type: "percent", basisPoints: bp };
      } else {
        const sh: Record<string, number> = {};
        for (const id of ids) {
          const v = values.get(id)!;
          if (!Number.isInteger(v) || v < 0 || v > 999) bad = true;
          else sh[id] = v;
        }
        input = { type: "shares", shares: sh };
      }
      if (!bad && input) {
        if (input.type === "exact") {
          // Exact amounts can only be checked against a known total.
          bad = amountMinor === null || !computeSplit(amountMinor, input, order).ok;
        } else if (input.type === "percent") {
          bad = Object.values(input.basisPoints).reduce((a, b) => a + b, 0) !== 10000;
        } else {
          bad = !computeSplit(amountMinor ?? 1, input, order).ok;
        }
      }
      if (!bad && input) {
        participantIds = ids;
        splitValues = Object.fromEntries(
          ids.map((id) => {
            if (input!.type === "exact") return [id, minorToMajorString((input as { amounts: Record<string, number> }).amounts[id], exp)];
            if (input!.type === "percent") return [id, bpsToPercentString((input as { basisPoints: Record<string, number> }).basisPoints[id])];
            return [id, String((input as { shares: Record<string, number> }).shares[id])];
          }),
        );
      }
    }
    if (bad) flags.push({ field: "split", reason: "invalid" });
  } else if (participantsIncomplete) {
    flags.push({ field: "split", reason: "invalid" });
  }
  if (participantIds.length === 0 && model.participants.length === 0 && splitType === "equal") {
    flags.push({ field: "participants", reason: "missing" });
  }

  // Category from the fixed list (case-insensitive).
  let category: Category | null = null;
  if (model.category?.trim()) {
    category = CATEGORIES.find((c) => c.toLowerCase() === model.category!.trim().toLowerCase()) ?? null;
    if (!category) flags.push({ field: "category", reason: "invalid", value: model.category });
  }

  // Date: real, not in the future, not more than a year old.
  let date: string | null = null;
  if (model.date?.trim()) {
    const d = model.date.trim();
    const real = /^\d{4}-\d{2}-\d{2}$/.test(d) && addDaysSafe(d) === d;
    if (real && d <= ctx.today && d >= addDays(ctx.today, -365)) date = d;
    else flags.push({ field: "date", reason: "invalid", value: d });
  }

  return {
    prefill: { description, amountMinor, currency, payerId, splitType, participantIds, splitValues, category, date },
    flags,
  };
}

/** Round-trips a date through addDays(…, 0); differs for impossible dates like 2026-02-30. */
function addDaysSafe(d: string): string | null {
  try {
    return addDays(d, 0);
  } catch {
    return null;
  }
}

// ---------- Eval metrics (R66) ----------

export type NlGold = {
  amountMinor: Minor | null;
  payerId: string | null;
  /** null = should be left blank ([] in the prefill). */
  participantIds: string[] | null;
  splitType: NlSplitType;
  /** Expected form values for exact/percent/shares; null for a non-equal split means "left blank". */
  splitValues?: Record<string, string> | null;
  /** For the paise comparison (D-27); defaults to INR. */
  currency?: string;
};

export type NlEvalCase = {
  id: string;
  gold: NlGold;
  predicted: NlResult | null;
  ambiguous: boolean;
  /** Fields that must be blank for a correct abstention. */
  blank: NlField[];
  latencyMs: number;
  /** Member ids in display order (the R13 tie-break order); defaults to sorted ids. */
  memberOrder?: string[];
};

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

type SplitShape = { amountMinor: Minor | null; type: NlSplitType; participants: readonly string[]; values: Record<string, string> | null | undefined };

/**
 * D-27: what each participant would owe, in minor units. Returns "blank" for a non-equal split
 * without values, and null when it can't be computed (no amount, no participants or invalid).
 */
export function owedBySplit(s: SplitShape, order: readonly string[], currency = "INR"): Record<string, Minor> | "blank" | null {
  if (s.type !== "equal" && !s.values) return "blank";
  if (s.amountMinor === null || s.amountMinor <= 0) return null;
  const exp = exponent(currency);
  const ids = s.type === "equal" ? [...s.participants] : Object.keys(s.values!);
  const known = [...new Set([...order, ...ids])];
  let input: SplitInput | null = null;
  if (s.type === "equal") input = ids.length ? { type: "equal", participants: ids } : null;
  else {
    const entries = Object.entries(s.values!);
    if (s.type === "exact") {
      const amounts = Object.fromEntries(entries.map(([k, v]) => [k, decimalToMinor(v, exp)]));
      input = { type: "exact", amounts };
    } else if (s.type === "percent") {
      const bp = entries.map(([k, v]) => [k, percentToBasisPoints(v)] as const);
      input = bp.every(([, b]) => b !== null) ? { type: "percent", basisPoints: Object.fromEntries(bp) as Record<string, number> } : null;
    } else {
      input = { type: "shares", shares: Object.fromEntries(entries.map(([k, v]) => [k, Number(v)])) };
    }
  }
  if (!input) return null;
  const r = computeSplit(s.amountMinor, input, known);
  return r.ok ? Object.fromEntries(r.value.filter((x) => x.owedMinor !== 0).map((x) => [x.memberId, x.owedMinor])) : null;
}

/** D-27: two splits match when they give every participant the same paise. */
export function splitsMatch(gold: SplitShape, predicted: SplitShape, order: readonly string[], currency = "INR"): boolean {
  const g = owedBySplit(gold, order, currency);
  const p = owedBySplit(predicted, order, currency);
  if (g === "blank" || p === "blank") return g === p;
  if (g && p) return sameSet(Object.keys(g), Object.keys(p)) && Object.entries(g).every(([k, v]) => p[k] === v);
  // Not computable (e.g. no amount): same type, same people, same values.
  const sameValues =
    !gold.values || (!!predicted.values && sameSet(Object.keys(predicted.values), Object.keys(gold.values)) && Object.entries(gold.values).every(([k, v]) => predicted.values![k] === v));
  return gold.type === predicted.type && sameSet(gold.participants, predicted.participants) && sameValues;
}

export function isBlank(p: NlPrefill, field: NlField): boolean {
  switch (field) {
    case "amount":
      return p.amountMinor === null;
    case "payer":
      return p.payerId === null;
    case "participants":
      return p.participantIds.length === 0;
    case "split":
      return p.splitValues === null;
    case "category":
      return p.category === null;
    case "date":
      return p.date === null;
    case "description":
      return p.description === null;
    case "currency":
      return false;
  }
}

export type NlEvalRow = {
  id: string;
  amount: boolean;
  payer: boolean;
  participants: boolean;
  splitType: boolean;
  exact: boolean;
  ambiguous: boolean;
  abstained: boolean | null;
  error: boolean;
  latencySec: number;
};

export type NlEvalSummary = {
  n: number;
  amountAccuracy: number;
  payerAccuracy: number;
  participantsAccuracy: number;
  splitTypeAccuracy: number;
  exactMatchRate: number;
  ambiguousN: number;
  abstentionRate: number;
  meanLatencySec: number;
  perSentence: NlEvalRow[];
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function scoreNl(cases: readonly NlEvalCase[]): NlEvalSummary {
  const rows: NlEvalRow[] = cases.map((c) => {
    const p = c.predicted?.prefill;
    const amount = !!p && p.amountMinor === c.gold.amountMinor;
    const payer = !!p && p.payerId === c.gold.payerId;
    const participants = !!p && (c.gold.participantIds === null ? p.participantIds.length === 0 : sameSet(p.participantIds, c.gold.participantIds));
    const splitType = !!p && p.splitType === c.gold.splitType;
    // D-27: exact match compares the splits by what each participant owes, not by split type.
    const order = c.memberOrder ?? [...new Set([...(c.gold.participantIds ?? []), ...(p?.participantIds ?? [])])].sort();
    const split =
      !!p &&
      splitsMatch(
        { amountMinor: c.gold.amountMinor, type: c.gold.splitType, participants: c.gold.participantIds ?? [], values: c.gold.splitType === "equal" ? null : (c.gold.splitValues ?? null) },
        { amountMinor: p.amountMinor, type: p.splitType, participants: p.participantIds, values: p.splitType === "equal" ? null : p.splitValues },
        order,
        c.gold.currency,
      );
    const exact = amount && payer && participants && split;
    const abstained = c.ambiguous ? !!p && c.blank.every((f) => isBlank(p, f)) : null;
    return { id: c.id, amount, payer, participants, splitType, exact, ambiguous: c.ambiguous, abstained, error: !p, latencySec: r3(c.latencyMs / 1000) };
  });
  const n = rows.length;
  const rate = (f: (r: NlEvalRow) => boolean) => (n ? r3(rows.filter(f).length / n) : 0);
  const amb = rows.filter((r) => r.ambiguous);
  return {
    n,
    amountAccuracy: rate((r) => r.amount),
    payerAccuracy: rate((r) => r.payer),
    participantsAccuracy: rate((r) => r.participants),
    splitTypeAccuracy: rate((r) => r.splitType),
    exactMatchRate: rate((r) => r.exact),
    ambiguousN: amb.length,
    abstentionRate: amb.length ? r3(amb.filter((r) => r.abstained).length / amb.length) : 0,
    meanLatencySec: n ? r3(cases.reduce((a, c) => a + c.latencyMs, 0) / n / 1000) : 0,
    perSentence: rows,
  };
}
