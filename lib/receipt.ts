// Receipt extraction schema, reconciliation, itemized allocation and eval metrics (R31–R37).
import { z } from "zod";
import { allocate, decimalToMinor, sum, type Minor } from "./money";
import { exponent, isSupportedCurrency } from "./currency";

export type ReceiptItem = { name: string; quantity: number; amountMinor: Minor };

export type ReceiptData = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  items: ReceiptItem[];
  taxMinor: Minor;
  serviceMinor: Minor;
  tipMinor: Minor;
  discountMinor: Minor;
  roundOffMinor: Minor;
  totalMinor: Minor;
};

// ---------- Model contract (SPEC §4.3); shared by the app and `npm run eval` ----------

export const RECEIPT_PROMPT = `You read photos of shop and restaurant receipts (mostly Indian) and return JSON only.
Rules:
- items: every purchased line item. name as printed (short), quantity (1 if not printed), amount = the LINE TOTAL as printed, in major units (e.g. 249.50).
- Do not include tax, service charge, tip, discount, round-off, subtotal or total lines as items.
- Lines printed under an item (add-ons, extras, modifiers, e.g. "Extra cheese 1x50 = 50") are part of that item's amount, not separate items. Use the item's printed line total; never add the add-on again.
- tax: sum of all tax lines (CGST + SGST + IGST, VAT, cess). tip: tip or gratuity.
- service_charge: the sum of the service charge and every platform, packaging, convenience and delivery fee actually charged. A fee shown as free or struck out counts as 0.
- discount: total discount as a positive number. round_off: the round-off line, negative if it reduces the bill.
- total: the final amount payable as printed (grand total).
- Missing extras are 0. merchant, date (YYYY-MM-DD) and currency (ISO 4217, e.g. INR) may be null if not printed.
- Never invent items that are not printed.`;

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    currency: { type: ["string", "null"], description: "ISO 4217 code" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          amount: { type: "number", description: "line total in major units, as printed" },
        },
        required: ["name", "quantity", "amount"],
      },
    },
    tax: { type: "number" },
    service_charge: { type: "number" },
    tip: { type: "number" },
    discount: { type: "number" },
    round_off: { type: "number" },
    total: { type: "number" },
  },
  required: ["merchant", "date", "currency", "items", "tax", "service_charge", "tip", "discount", "round_off", "total"],
} as const;

const nonNeg = z.preprocess((v) => (v === null || v === undefined ? 0 : v), z.number().finite().min(0));

/** zod validation of the model output (R31): amounts ≥ 0 except round_off; items required. */
export const modelReceiptSchema = z.object({
  merchant: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable()),
  date: z.preprocess(
    (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
    z.string().nullable(),
  ),
  currency: z.preprocess(
    (v) => (typeof v === "string" && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null),
    z.string().nullable(),
  ),
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      quantity: z.preprocess((v) => (v === null || v === undefined ? 1 : v), z.number().finite().positive()),
      amount: z.number().finite().min(0),
    }),
  ),
  tax: nonNeg,
  service_charge: nonNeg,
  tip: nonNeg,
  discount: nonNeg,
  round_off: z.preprocess((v) => (v === null || v === undefined ? 0 : v), z.number().finite()),
  total: nonNeg,
});

export type ModelReceipt = z.infer<typeof modelReceiptSchema>;

/** Validates raw model output and converts major units to minor units (half-up). */
export function parseModelReceipt(raw: unknown, fallbackCurrency: string): ReceiptData | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = modelReceiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const r = parsed.data;
  const currency = r.currency && isSupportedCurrency(r.currency) ? r.currency : null;
  const e = exponent(currency ?? fallbackCurrency);
  const m = (v: number) => decimalToMinor(v, e);
  return {
    merchant: r.merchant,
    date: r.date,
    currency,
    items: r.items.map((it) => ({ name: it.name, quantity: it.quantity, amountMinor: m(it.amount) })),
    taxMinor: m(r.tax),
    serviceMinor: m(r.service_charge),
    tipMinor: m(r.tip),
    discountMinor: m(r.discount),
    roundOffMinor: m(r.round_off),
    totalMinor: m(r.total),
  };
}

// ---------- Reconciliation (R33) ----------

export function itemsTotal(r: Pick<ReceiptData, "items">): Minor {
  return sum(r.items.map((i) => i.amountMinor));
}

/** diff = total − (Σitems + tax + service_charge + tip − discount + round_off) */
export function receiptDiff(r: ReceiptData): Minor {
  return (
    r.totalMinor -
    (itemsTotal(r) + r.taxMinor + r.serviceMinor + r.tipMinor - r.discountMinor + r.roundOffMinor)
  );
}

/** Mismatch when |diff| exceeds one major unit (₹1 = 100 paise). */
export function isMismatch(diffMinor: Minor, currencyExponent = 2): boolean {
  return Math.abs(diffMinor) > 10 ** currencyExponent;
}

// ---------- Itemized allocation (R34, R35) ----------

export type ItemAssignment = { amountMinor: Minor; assignees: readonly string[] };

export type ItemizedResult =
  | {
      ok: true;
      owed: Record<string, Minor>;
      itemShares: Record<string, Minor>;
      remainderShares: Record<string, Minor>;
      remainderMinor: Minor;
    }
  | { ok: false; error: "UNASSIGNED_ITEM"; itemIndex: number }
  | { ok: false; error: "NO_ITEMS" };

/**
 * Each item is split equally among its assignees; remainder = printed total − Σitems
 * (tax, service, tip, discount, round-off and any unexplained difference) is allocated in
 * proportion to item subtotals. `memberOrder` lists member ids in display order (tie-break).
 */
export function allocateItemized(
  items: readonly ItemAssignment[],
  printedTotalMinor: Minor,
  memberOrder: readonly string[],
): ItemizedResult {
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  const itemShares: Record<string, Minor> = Object.fromEntries(memberOrder.map((id) => [id, 0]));

  for (let i = 0; i < items.length; i++) {
    const assignees = [...new Set(items[i].assignees)].filter((id) => rank.has(id));
    if (assignees.length === 0) return { ok: false, error: "UNASSIGNED_ITEM", itemIndex: i };
    assignees.sort((a, b) => rank.get(a)! - rank.get(b)!);
    const shares = allocate(items[i].amountMinor, assignees.map(() => 1));
    assignees.forEach((id, k) => (itemShares[id] += shares[k]));
  }

  const subtotal = sum(Object.values(itemShares));
  if (items.length === 0 || subtotal <= 0) return { ok: false, error: "NO_ITEMS" };

  const remainderMinor = printedTotalMinor - subtotal;
  const weights = memberOrder.map((id) => itemShares[id]);
  const rem = remainderMinor === 0 ? weights.map(() => 0) : allocate(remainderMinor, weights);
  const remainderShares: Record<string, Minor> = {};
  const owed: Record<string, Minor> = {};
  memberOrder.forEach((id, k) => {
    remainderShares[id] = rem[k];
    owed[id] = itemShares[id] + rem[k];
  });
  return { ok: true, owed, itemShares, remainderShares, remainderMinor };
}

// ---------- Extraction with timeout (R31, R32) ----------

export type ReceiptModelClient = (req: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  jsonSchema: typeof RECEIPT_JSON_SCHEMA;
  signal: AbortSignal;
}) => Promise<string>;

export type ExtractResult =
  | { ok: true; data: ReceiptData; raw: string; latencyMs: number }
  | { ok: false; error: "EXTRACT_FAILED"; reason: "timeout" | "model_error" | "invalid_output"; latencyMs: number };

export async function extractReceipt(
  image: { base64: string; mimeType: string },
  client: ReceiptModelClient,
  opts: { timeoutMs?: number; fallbackCurrency?: string; now?: () => number } = {},
): Promise<ExtractResult> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const now = opts.now ?? Date.now;
  const started = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const raced = await Promise.race([
      client({
        imageBase64: image.base64,
        mimeType: image.mimeType,
        prompt: RECEIPT_PROMPT,
        jsonSchema: RECEIPT_JSON_SCHEMA,
        signal: controller.signal,
      }).then((text) => ({ text })),
      timeout,
    ]);
    const latencyMs = now() - started;
    if (raced === "timeout") return { ok: false, error: "EXTRACT_FAILED", reason: "timeout", latencyMs };
    const data = parseModelReceipt(raced.text, opts.fallbackCurrency ?? "INR");
    if (!data) return { ok: false, error: "EXTRACT_FAILED", reason: "invalid_output", latencyMs };
    return { ok: true, data, raw: raced.text, latencyMs };
  } catch {
    return { ok: false, error: "EXTRACT_FAILED", reason: "model_error", latencyMs: now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Eval metrics (R37) ----------

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max;
}

type EvalItem = { name: string; amountMinor: Minor };

/** One-to-one greedy matching, highest similarity first; amounts within ₹1 and similarity ≥ 0.6. */
export function matchItems(
  predicted: readonly EvalItem[],
  truth: readonly EvalItem[],
  opts: { amountTolMinor?: number; minSimilarity?: number } = {},
): { matched: number; pairs: [number, number][] } {
  const tol = opts.amountTolMinor ?? 100;
  const minSim = opts.minSimilarity ?? 0.6;
  const candidates: { p: number; t: number; s: number }[] = [];
  predicted.forEach((pi, p) =>
    truth.forEach((ti, t) => {
      if (Math.abs(pi.amountMinor - ti.amountMinor) > tol) return;
      const s = nameSimilarity(pi.name, ti.name);
      if (s >= minSim) candidates.push({ p, t, s });
    }),
  );
  candidates.sort((a, b) => b.s - a.s || a.p - b.p || a.t - b.t);
  const usedP = new Set<number>();
  const usedT = new Set<number>();
  const pairs: [number, number][] = [];
  for (const c of candidates) {
    if (usedP.has(c.p) || usedT.has(c.t)) continue;
    usedP.add(c.p);
    usedT.add(c.t);
    pairs.push([c.p, c.t]);
  }
  return { matched: pairs.length, pairs };
}

export type EvalCase = { id: string; predicted: ReceiptData | null; truth: ReceiptData; latencyMs: number };

export type EvalReceiptRow = {
  id: string;
  predictedItems: number;
  truthItems: number;
  matched: number;
  totalCorrect: boolean;
  reconciled: boolean;
  latencySec: number;
  error: boolean;
};

export type EvalSummary = {
  n: number;
  precision: number;
  recall: number;
  f1: number;
  totalAccuracy: number;
  reconciliationRate: number;
  meanLatencySec: number;
  perReceipt: EvalReceiptRow[];
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Micro-averaged precision/recall/F1, total accuracy, reconciliation rate, mean latency. */
export function scoreEval(cases: readonly EvalCase[]): EvalSummary {
  let matched = 0;
  let predicted = 0;
  let truth = 0;
  let totalOk = 0;
  let reconOk = 0;
  let latency = 0;
  const perReceipt: EvalReceiptRow[] = cases.map((c) => {
    const pItems = c.predicted?.items ?? [];
    const m = matchItems(pItems, c.truth.items).matched;
    const totalCorrect = !!c.predicted && Math.abs(c.predicted.totalMinor - c.truth.totalMinor) <= 100;
    const reconciled = !!c.predicted && !isMismatch(receiptDiff(c.predicted));
    matched += m;
    predicted += pItems.length;
    truth += c.truth.items.length;
    totalOk += totalCorrect ? 1 : 0;
    reconOk += reconciled ? 1 : 0;
    latency += c.latencyMs;
    return {
      id: c.id,
      predictedItems: pItems.length,
      truthItems: c.truth.items.length,
      matched: m,
      totalCorrect,
      reconciled,
      latencySec: round3(c.latencyMs / 1000),
      error: !c.predicted,
    };
  });
  const precision = predicted ? matched / predicted : 0;
  const recall = truth ? matched / truth : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const n = cases.length;
  return {
    n,
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    totalAccuracy: n ? round3(totalOk / n) : 0,
    reconciliationRate: n ? round3(reconOk / n) : 0,
    meanLatencySec: n ? round3(latency / n / 1000) : 0,
    perReceipt,
  };
}

export type EvalAnsweredSummary = {
  n: number;
  answered: number;
  /** Share of receipts that got a valid answer within the limit. */
  answerRate: number;
  /** The metrics below count only the answered receipts. */
  precision: number;
  recall: number;
  f1: number;
  totalAccuracy: number;
  reconciliationRate: number;
};

/** D-35: separates "no answer" from "wrong answer", as for type-to-add (D-31); from saved per-receipt rows. */
export function answeredReceiptSummary(rows: readonly Omit<EvalReceiptRow, "id" | "latencySec">[]): EvalAnsweredSummary {
  const a = rows.filter((r) => !r.error);
  const sum = (f: (r: (typeof a)[number]) => number) => a.reduce((s, r) => s + f(r), 0);
  const matched = sum((r) => r.matched);
  const predicted = sum((r) => r.predictedItems);
  const truth = sum((r) => r.truthItems);
  const precision = predicted ? matched / predicted : 0;
  const recall = truth ? matched / truth : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    n: rows.length,
    answered: a.length,
    answerRate: rows.length ? round3(a.length / rows.length) : 0,
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    totalAccuracy: a.length ? round3(a.filter((r) => r.totalCorrect).length / a.length) : 0,
    reconciliationRate: a.length ? round3(a.filter((r) => r.reconciled).length / a.length) : 0,
  };
}
