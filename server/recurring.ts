import "server-only";
import { z } from "zod";
import { exponent, todayIST } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import { occurrenceAt, occurrencesDue, type Frequency } from "@/lib/recurring";
import { db } from "@/server/db";
import { fromDbError, invalid, notFound } from "@/server/errors";
import { loadMembers, requireGroup, type GroupRow, type MemberRow } from "@/server/context";
import { actorId, rpc } from "@/server/groups";
import { prepareExpense } from "@/server/expenses";
import { dateSchema, expenseInputSchema, idSchema, parseInput, type ExpenseInput } from "@/server/schemas";

// R44–R46 (Should): recurring rules, generated lazily when the group is opened (no cron).

export const repeatSchema = z.object({
  frequency: z.enum(["weekly", "monthly"]),
  endDate: dateSchema.nullish(),
});
export type RepeatInput = z.input<typeof repeatSchema>;

type Template = Omit<ExpenseInput, "expenseDate" | "manualRate">;

export type RuleView = {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  frequency: Frequency;
  anchorDate: string;
  nextDue: string;
  endDate: string | null;
  active: boolean;
};

/** R44: creates a rule from an expense; the expense itself is the first occurrence. */
export async function createRecurringRule(token: unknown, input: ExpenseInput, repeat: RepeatInput, actor?: unknown, firstExpenseId?: string) {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const data = parseInput(expenseInputSchema, input);
  const r = parseInput(repeatSchema, repeat);
  const actorMemberId = actorId(members, actor);
  if (r.endDate && r.endDate < data.expenseDate) throw invalid("The end date is before the first date");
  const template: Template = {
    description: data.description,
    category: data.category,
    notes: data.notes ?? null,
    currency: data.currency,
    amountMinor: data.amountMinor,
    payers: data.payers,
    split: data.split,
  };
  const rule = { frequency: r.frequency, anchorDate: data.expenseDate };
  const id = await rpc<string>("create_recurring_rule", {
    p_group_id: group.id,
    p_rule: {
      template,
      frequency: r.frequency,
      anchor_date: data.expenseDate,
      next_due: occurrenceAt(rule, 1),
      end_date: r.endDate ?? null,
      created_by_member_id: actorMemberId,
    },
    p_activity: {
      actor_member_id: actorMemberId,
      action: "recurring.created",
      summary: `Set "${data.description}" to repeat ${r.frequency}${r.endDate ? ` until ${r.endDate}` : ""}`,
    },
  });
  // Link the first expense to the rule's first occurrence so it is never generated twice.
  if (firstExpenseId) {
    await db().from("expenses").update({ recurring_rule_id: id, recurring_occurrence: data.expenseDate }).eq("id", firstExpenseId).eq("group_id", group.id);
  }
  return { id };
}

type DbRule = { id: string; template: Template; frequency: Frequency; anchor_date: string; next_due: string; end_date: string | null; active: boolean };

/** R45: create every due, not-yet-created occurrence (idempotent; at most 24 per rule per open). */
export async function materializeRecurring(group: GroupRow, members: MemberRow[]): Promise<number> {
  const today = todayIST();
  const { data, error } = await db()
    .from("recurring_rules")
    .select("id, template, frequency, anchor_date, next_due, end_date, active")
    .eq("group_id", group.id)
    .eq("active", true)
    .lte("next_due", today);
  if (error) throw fromDbError(error, "materializeRecurring");
  let created = 0;
  for (const rule of (data ?? []) as DbRule[]) {
    const due = occurrencesDue(
      { frequency: rule.frequency, anchorDate: rule.anchor_date, nextDue: rule.next_due, endDate: rule.end_date, active: rule.active },
      today,
    );
    for (let i = 0; i < due.dates.length; i++) {
      const date = due.dates[i];
      const nextDue = due.dates[i + 1] ?? due.nextDue;
      try {
        const p = await prepareExpense(group, members, { ...rule.template, expenseDate: date });
        const id = await rpc<string | null>("generate_recurring", {
          p_group_id: group.id,
          p_rule_id: rule.id,
          p_occurrence: date,
          p_next_due: nextDue,
          p_expense: p.expense,
          p_payers: p.payers,
          p_splits: p.splits,
          p_activity: {
            actor_member_id: null,
            action: "recurring.generated",
            summary: `Added recurring "${p.snapshot.description}" ${formatMoney(p.snapshot.amountMinor, p.snapshot.currency, exponent(p.snapshot.currency))} for ${date}`,
          },
        });
        if (id) created++;
      } catch {
        // e.g. the exchange rate is unavailable right now: try again on the next open
        console.error(`recurring rule ${rule.id}: occurrence ${date} not generated`);
        break;
      }
    }
    if (due.dates.length === 0 && due.nextDue !== rule.next_due) {
      await db().from("recurring_rules").update({ next_due: due.nextDue }).eq("id", rule.id);
    }
  }
  return created;
}

export async function listRules(token: unknown): Promise<RuleView[]> {
  const group = await requireGroup(token);
  const { data, error } = await db()
    .from("recurring_rules")
    .select("id, template, frequency, anchor_date, next_due, end_date, active")
    .eq("group_id", group.id)
    .order("created_at", { ascending: true });
  if (error) throw fromDbError(error, "listRules");
  return ((data ?? []) as DbRule[]).map((r) => ({
    id: r.id,
    description: r.template.description,
    amountMinor: r.template.amountMinor,
    currency: r.template.currency,
    frequency: r.frequency,
    anchorDate: r.anchor_date,
    nextDue: r.next_due,
    endDate: r.end_date,
    active: r.active,
  }));
}

/** R46: pause/resume or delete; future occurrences only (generated expenses stay). */
export async function updateRule(token: unknown, ruleId: unknown, change: "pause" | "resume" | "delete", actor?: unknown) {
  const group = await requireGroup(token);
  const members = await loadMembers(group.id);
  const id = parseInput(idSchema, ruleId);
  const actorMemberId = actorId(members, actor);
  const rule = (await listRules(token)).find((r) => r.id === id);
  if (!rule) throw notFound();
  await rpc("update_recurring_rule", {
    p_group_id: group.id,
    p_rule_id: id,
    p_active: change === "resume",
    p_delete: change === "delete",
    p_activity: {
      actor_member_id: actorMemberId,
      action: change === "delete" ? "recurring.deleted" : "recurring.updated",
      summary: `${change === "delete" ? "Stopped" : change === "pause" ? "Paused" : "Resumed"} repeating "${rule.description}"`,
    },
  });
}
