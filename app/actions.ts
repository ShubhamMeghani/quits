"use server";

// Server Actions: thin wrappers over the server services. Every action re-validates its input
// and resolves the group from the token (R55); the browser never talks to Supabase (R54).
import { refresh } from "next/cache";
import { AppError } from "@/server/errors";
import { createGroup, listActivity, updateGroupSettings } from "@/server/groups";
import { addMember, archiveMember, updateMember } from "@/server/members";
import { createExpense, deleteExpense, listExpenses, restoreExpense, updateExpense } from "@/server/expenses";
import { createSettlement, deleteSettlement, restoreSettlement } from "@/server/settlements";
import { createManualReceipt, finalizeReceipt, saveReceiptDraft, type FinalizeInput, type ReceiptInput } from "@/server/receipts";
import { createDemo, resetDemo } from "@/server/demo";
import { createRecurringRule, updateRule, type RepeatInput } from "@/server/recurring";
import type { CreateGroupInput, ExpenseInput, GroupSettingsInput, MemberInput, SettlementInput } from "@/server/schemas";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string; fields?: Record<string, string> };

function stringRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const entries = Object.entries(v as Record<string, unknown>);
  return entries.every(([, x]) => typeof x === "string") ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
}

async function run<T>(fn: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (opts.refresh !== false) refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, message: e.message, code: e.code, fields: stringRecord(e.details) };
    }
    console.error("action failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function createGroupAction(input: CreateGroupInput) {
  return run(() => createGroup(input), { refresh: false });
}

export async function updateGroupSettingsAction(token: string, input: GroupSettingsInput, actor: string | null) {
  return run(() => updateGroupSettings(token, input, actor));
}

export async function addMemberAction(token: string, input: MemberInput, actor: string | null) {
  return run(() => addMember(token, input, actor));
}

export async function updateMemberAction(token: string, memberId: string, input: MemberInput, actor: string | null) {
  return run(() => updateMember(token, memberId, input, actor));
}

export async function archiveMemberAction(token: string, memberId: string, actor: string | null) {
  return run(() => archiveMember(token, memberId, actor));
}

export async function createExpenseAction(token: string, input: ExpenseInput, actor: string | null, repeat?: RepeatInput | null) {
  return run(async () => {
    const created = await createExpense(token, input, actor);
    // R44 (Should): the new expense is the first occurrence of the rule.
    if (repeat) await createRecurringRule(token, input, repeat, actor, created.id);
    return created;
  });
}

export async function updateExpenseAction(token: string, expenseId: string, input: ExpenseInput, actor: string | null) {
  return run(() => updateExpense(token, expenseId, input, actor));
}

export async function deleteExpenseAction(token: string, expenseId: string, actor: string | null) {
  return run(() => deleteExpense(token, expenseId, actor));
}

export async function restoreExpenseAction(token: string, expenseId: string, actor: string | null) {
  return run(() => restoreExpense(token, expenseId, actor));
}

export async function createSettlementAction(token: string, input: SettlementInput, actor: string | null) {
  return run(() => createSettlement(token, input, actor));
}

export async function deleteSettlementAction(token: string, settlementId: string, actor: string | null) {
  return run(() => deleteSettlement(token, settlementId, actor));
}

export async function restoreSettlementAction(token: string, settlementId: string, actor: string | null) {
  return run(() => restoreSettlement(token, settlementId, actor));
}

export async function loadMoreExpensesAction(token: string, offset: number) {
  return run(() => listExpenses(token, offset), { refresh: false });
}

export async function loadMoreActivityAction(token: string, offset: number) {
  return run(() => listActivity(token, offset), { refresh: false });
}

export async function createManualReceiptAction(token: string) {
  return run(() => createManualReceipt(token), { refresh: false });
}

export async function saveReceiptDraftAction(token: string, receiptId: string, input: ReceiptInput) {
  // No refresh: the editor keeps its state; its "Refresh" button reloads claims from other devices.
  return run(() => saveReceiptDraft(token, receiptId, input), { refresh: false });
}

export async function finalizeReceiptAction(token: string, receiptId: string, input: FinalizeInput, actor: string | null) {
  return run(() => finalizeReceipt(token, receiptId, input, actor));
}

export async function createDemoAction() {
  return run(() => createDemo(), { refresh: false });
}

export async function resetDemoAction(token: string, actor: string | null) {
  return run(() => resetDemo(token, actor));
}

export async function updateRuleAction(token: string, ruleId: string, change: "pause" | "resume" | "delete", actor: string | null) {
  return run(() => updateRule(token, ruleId, change, actor));
}
