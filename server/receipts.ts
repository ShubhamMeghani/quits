import "server-only";
import { z } from "zod";
import { exponent, isSupportedCurrency, todayIST } from "@/lib/currency";
import { allocateItemized, isMismatch, receiptDiff, type ReceiptData } from "@/lib/receipt";
import { buildExpenseAmounts, CATEGORIES, splitErrorMessage } from "@/lib/splits";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { AppError, fromDbError, invalid, notFound } from "@/server/errors";
import { assertMembersBelong, loadMembers, requireGroup, type GroupRow } from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { resolveRate } from "@/server/rates";
import { currencySchema, dateSchema, idSchema, parseInput } from "@/server/schemas";

// ---------- Scan limit (R30) ----------

const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Counts this scan for the group and the whole app; false when either is over today's limit. */
export async function bumpScanLimits(groupId: string): Promise<boolean> {
  const day = todayIST();
  const [g, a] = await Promise.all([
    rpc<number>("bump_rate_limit", { p_bucket: `scan:group:${groupId}`, p_day: day }),
    rpc<number>("bump_rate_limit", { p_bucket: "scan:app", p_day: day }),
  ]);
  return g <= limit("SCAN_LIMIT_PER_GROUP", 30) && a <= limit("SCAN_LIMIT_PER_APP", 300);
}

// ---------- Input ----------

const minor = z.number().int().min(0).max(1_000_000_000_000);

export const receiptItemSchema = z.object({
  name: z.string().trim().min(1, "Every item needs a name").max(100),
  quantity: z.number().positive().max(9999),
  amountMinor: minor,
  assignees: z.array(idSchema).max(50),
});

export const receiptInputSchema = z.object({
  merchant: z.string().trim().max(100).nullish(),
  date: dateSchema.nullish(),
  currency: currencySchema,
  items: z.array(receiptItemSchema).max(100),
  taxMinor: minor,
  serviceMinor: minor,
  tipMinor: minor,
  discountMinor: minor,
  roundOffMinor: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  totalMinor: minor,
});

export const finalizeSchema = z.object({
  receipt: receiptInputSchema,
  description: z.string().trim().min(1, "Enter a description").max(100),
  category: z.enum(CATEGORIES),
  expenseDate: dateSchema,
  payerId: idSchema,
});

export type ReceiptInput = z.input<typeof receiptInputSchema>;
export type FinalizeInput = z.input<typeof finalizeSchema>;

function toData(r: z.infer<typeof receiptInputSchema>): ReceiptData {
  return {
    merchant: r.merchant ?? null,
    date: r.date ?? null,
    currency: r.currency,
    items: r.items.map((i) => ({ name: i.name, quantity: i.quantity, amountMinor: i.amountMinor })),
    taxMinor: r.taxMinor,
    serviceMinor: r.serviceMinor,
    tipMinor: r.tipMinor,
    discountMinor: r.discountMinor,
    roundOffMinor: r.roundOffMinor,
    totalMinor: r.totalMinor,
  };
}

function receiptJson(r: z.infer<typeof receiptInputSchema>, extra: { model?: string; extracted?: unknown } = {}) {
  return {
    ...extra,
    merchant: r.merchant ?? null,
    receipt_date: r.date ?? null,
    currency: r.currency,
    tax_minor: r.taxMinor,
    service_minor: r.serviceMinor,
    tip_minor: r.tipMinor,
    discount_minor: r.discountMinor,
    round_off_minor: r.roundOffMinor,
    printed_total_minor: r.totalMinor,
    diff_minor: receiptDiff(toData(r)),
  };
}

const itemsJson = (r: z.infer<typeof receiptInputSchema>) =>
  r.items.map((i) => ({ name: i.name, quantity: i.quantity, amount_minor: i.amountMinor, assignees: [...new Set(i.assignees)] }));

// ---------- Drafts ----------

/** Creates a draft from a model extraction (or an empty one for manual entry, R32). */
export async function createReceiptDraft(group: GroupRow, data: ReceiptData | null, meta: { model?: string; extracted?: unknown } = {}): Promise<string> {
  const input: z.infer<typeof receiptInputSchema> = {
    merchant: data?.merchant ?? null,
    date: data?.date ?? null,
    currency: (data?.currency && isSupportedCurrency(data.currency) ? data.currency : group.baseCurrency) as z.infer<typeof currencySchema>,
    items: (data?.items ?? []).slice(0, 100).map((i) => ({ name: i.name.slice(0, 100), quantity: i.quantity > 0 ? Math.min(i.quantity, 9999) : 1, amountMinor: i.amountMinor, assignees: [] })),
    taxMinor: data?.taxMinor ?? 0,
    serviceMinor: data?.serviceMinor ?? 0,
    tipMinor: data?.tipMinor ?? 0,
    discountMinor: data?.discountMinor ?? 0,
    roundOffMinor: data?.roundOffMinor ?? 0,
    totalMinor: data?.totalMinor ?? 0,
  };
  return rpc<string>("save_receipt_draft", {
    p_group_id: group.id,
    p_receipt_id: null,
    p_receipt: receiptJson(input, meta),
    p_items: itemsJson(input),
  });
}

export async function createManualReceipt(token: unknown): Promise<{ id: string }> {
  const group = await requireGroup(token);
  return { id: await createReceiptDraft(group, null) };
}

export type ReceiptView = {
  id: string;
  status: "draft" | "finalized";
  expenseId: string | null;
  model: string | null;
  merchant: string | null;
  date: string | null;
  currency: string;
  taxMinor: number;
  serviceMinor: number;
  tipMinor: number;
  discountMinor: number;
  roundOffMinor: number;
  totalMinor: number;
  diffMinor: number;
  items: { id: string; name: string; quantity: number; amountMinor: number; assignees: string[] }[];
};

export async function loadReceipt(groupId: string, receiptId: string): Promise<ReceiptView> {
  const { data, error } = await db()
    .from("receipts")
    .select(
      "id, status, expense_id, model, merchant, receipt_date, currency, tax_minor, service_minor, tip_minor, discount_minor, round_off_minor, printed_total_minor, diff_minor, receipt_items(id, position, name, quantity::text, amount_minor, receipt_item_assignees(member_id))",
    )
    .eq("group_id", groupId)
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw fromDbError(error, "loadReceipt");
  if (!data) throw notFound();
  type Item = { id: string; position: number; name: string; quantity: string; amount_minor: number; receipt_item_assignees: { member_id: string }[] };
  const items = [...((data.receipt_items as Item[] | null) ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: data.id,
    status: data.status,
    expenseId: data.expense_id,
    model: data.model,
    merchant: data.merchant,
    date: data.receipt_date,
    currency: data.currency,
    taxMinor: Number(data.tax_minor),
    serviceMinor: Number(data.service_minor),
    tipMinor: Number(data.tip_minor),
    discountMinor: Number(data.discount_minor),
    roundOffMinor: Number(data.round_off_minor),
    totalMinor: Number(data.printed_total_minor),
    diffMinor: Number(data.diff_minor),
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: Number(i.quantity),
      amountMinor: Number(i.amount_minor),
      assignees: i.receipt_item_assignees.map((a) => a.member_id),
    })),
  };
}

/** Draft receipts of a group, newest first (R36: others open them to claim their items). */
export async function listDraftReceipts(groupId: string): Promise<{ id: string; merchant: string | null; totalMinor: number; currency: string; createdAt: string }[]> {
  const { data, error } = await db()
    .from("receipts")
    .select("id, merchant, printed_total_minor, currency, created_at")
    .eq("group_id", groupId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw fromDbError(error, "listDraftReceipts");
  return (data ?? []).map((r) => ({ id: r.id, merchant: r.merchant, totalMinor: Number(r.printed_total_minor), currency: r.currency, createdAt: r.created_at }));
}

export async function getReceipt(token: unknown, receiptId: unknown): Promise<ReceiptView> {
  const group = await requireGroup(token);
  return loadReceipt(group.id, parseInput(idSchema, receiptId));
}

/** Saves edits and item claims on a draft (R33, R34, R36). Last write wins. */
export async function saveReceiptDraft(token: unknown, receiptId: unknown, input: ReceiptInput): Promise<void> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, receiptId);
  const r = parseInput(receiptInputSchema, input);
  assertMembersBelong(members, r.items.flatMap((i) => i.assignees));
  await rpc("save_receipt_draft", { p_group_id: group.id, p_receipt_id: id, p_receipt: receiptJson(r), p_items: itemsJson(r) });
}

/**
 * R35: the expense amount is the printed total; total − Σitems is allocated in proportion to
 * item subtotals; created atomically with the receipt link and a `receipt.finalized` entry.
 */
export async function finalizeReceipt(token: unknown, receiptId: unknown, input: FinalizeInput, actor?: unknown): Promise<{ expenseId: string }> {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, receiptId);
  const data = parseInput(finalizeSchema, input);
  const actorMemberId = actorId(members, actor);
  const r = data.receipt;
  assertMembersBelong(members, [data.payerId, ...r.items.flatMap((i) => i.assignees)]);
  if (r.totalMinor <= 0) throw invalid("Enter the receipt total");

  const order = members.map((m) => m.id);
  const alloc = allocateItemized(
    r.items.map((i) => ({ amountMinor: i.amountMinor, assignees: i.assignees })),
    r.totalMinor,
    order,
  );
  if (!alloc.ok) {
    throw alloc.error === "UNASSIGNED_ITEM"
      ? invalid(`Choose who had "${r.items[alloc.itemIndex].name}"`, { item: String(alloc.itemIndex) })
      : invalid("Add at least one item with an amount");
  }
  const rate = await resolveRate({ date: data.expenseDate, currency: r.currency, baseCurrency: group.baseCurrency });
  const built = buildExpenseAmounts({
    amountMinor: r.totalMinor,
    currency: r.currency,
    baseCurrency: group.baseCurrency,
    rate: rate.rate,
    payers: { [data.payerId]: r.totalMinor },
    split: { type: "itemized", owed: alloc.owed },
    memberOrder: order,
  });
  if (!built.ok) throw invalid(splitErrorMessage(built.error, r.currency));
  const a = built.value;
  const diff = receiptDiff(toData(r));
  const expenseId = await rpc<string>("finalize_receipt", {
    p_group_id: group.id,
    p_receipt_id: id,
    p_receipt: receiptJson(r),
    p_items: itemsJson(r),
    p_expense: {
      description: data.description,
      category: data.category,
      notes: null,
      expense_date: data.expenseDate,
      currency: r.currency,
      amount_minor: a.amountMinor,
      fx_rate: rate.rate,
      fx_rate_date: rate.rateDate,
      fx_source: rate.source,
      base_amount_minor: a.baseAmountMinor,
      created_by_member_id: actorMemberId,
    },
    p_payers: a.payers.map((p) => ({ member_id: p.memberId, amount_minor: p.amountMinor, base_amount_minor: p.baseAmountMinor })),
    p_splits: a.splits.map((s) => ({ member_id: s.memberId, input_value: null, owed_minor: s.owedMinor, owed_base_minor: s.owedBaseMinor })),
    p_activity: {
      actor_member_id: actorMemberId,
      action: "receipt.finalized",
      summary: `Added itemized receipt "${data.description}" ${formatMoney(r.totalMinor, r.currency, exponent(r.currency))} (${r.items.length} items${isMismatch(diff, exponent(r.currency)) ? ", total mismatch" : ""})`,
    },
  });
  if (!expenseId) throw new AppError("INTERNAL", 500, "Something went wrong. Please try again.");
  return { expenseId };
}
