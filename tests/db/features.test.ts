import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteGroups, hasDb, sqlClient, TEST_PREFIX, type Sql } from "./helpers";
import { createGroup, readGroup, updateGroupSettings } from "@/server/groups";
import { createExpense, deleteExpense, getExpense, listExpenses, updateExpense } from "@/server/expenses";
import { createRecurringRule, listRules } from "@/server/recurring";
import { searchExpenses } from "@/server/search";
import { createDemo, resetDemo } from "@/server/demo";
import { DEMO_TARGET_BALANCES } from "@/lib/demo-seed";
import { occurrenceAt } from "@/lib/recurring";
import { todayIST, addDaysSafe } from "./dates";
import { settle } from "@/lib/simplify";

describe.skipIf(!hasDb)("DB: currency, search, recurring, demo (R15–R18, R40, R45, R47–R49)", () => {
  let sql: Sql;
  const tokens: string[] = [];
  const demoTokens: string[] = [];

  beforeAll(() => {
    sql = sqlClient();
  });

  afterAll(async () => {
    await deleteGroups(sql, tokens);
    if (demoTokens.length) await sql`delete from public.groups where is_demo and share_token in ${sql(demoTokens)}`;
    await sql.end();
  });

  it("AC-8 (local): a USD expense stores Frankfurter's rate; description edits keep it; a date change re-fetches", async () => {
    const { token } = await createGroup({ name: `${TEST_PREFIX} fx`, baseCurrency: "INR", memberNames: ["A", "B"] });
    tokens.push(token);
    const [A, B] = (await readGroup(token)).members.map((m) => m.id);
    const input = { description: "Hostel deposit", category: "Travel" as const, expenseDate: "2026-10-01", currency: "USD", amountMinor: 1000, payers: { [A]: 1000 }, split: { type: "equal" as const, participants: [A, B] } };
    const { id } = await createExpense(token, input);
    const e = await getExpense(token, id);
    expect(e).toMatchObject({ fxRate: "95.98", fxRateDate: "2026-10-01", fxSource: "frankfurter", baseAmountMinor: 95980 });
    const [cached] = await sql`select rate::text as rate from public.fx_rates where rate_date = '2026-10-01' and base = 'USD' and quote = 'INR'`;
    expect(cached.rate).toMatch(/^95\.98/);

    await updateExpense(token, id, { ...input, description: "Hostel deposit (paid)" });
    expect((await getExpense(token, id)).fxRate).toBe("95.98");
    await updateExpense(token, id, { ...input, expenseDate: "2026-10-04" });
    expect(await getExpense(token, id)).toMatchObject({ fxRate: "96.19", fxRateDate: "2026-10-04", fxSource: "frankfurter" });

    const inr = await createExpense(token, { ...input, currency: "INR" });
    expect(await getExpense(token, inr.id)).toMatchObject({ fxRate: "1", fxSource: "identity" });
    await expect(updateGroupSettings(token, { name: `${TEST_PREFIX} fx`, baseCurrency: "USD", defaultSplit: null })).rejects.toMatchObject({ code: "BASE_CURRENCY_LOCKED" });
  });

  it("AC-35 (server): a monthly rule from two months ago creates exactly the missing occurrences, once", async () => {
    const { token } = await createGroup({ name: `${TEST_PREFIX} recurring`, baseCurrency: "INR", memberNames: ["A", "B"] });
    tokens.push(token);
    const [A, B] = (await readGroup(token)).members.map((m) => m.id);
    const start = occurrenceAt({ frequency: "monthly", anchorDate: todayIST() }, -2);
    const input = { description: "Wi-Fi", category: "Utilities" as const, expenseDate: start, currency: "INR", amountMinor: 99900, payers: { [A]: 99900 }, split: { type: "equal" as const, participants: [A, B] } };
    const first = await createExpense(token, input, A);
    await createRecurringRule(token, input, { frequency: "monthly" }, A, first.id);
    expect((await readGroup(token)).expenseCount).toBe(3);
    expect((await readGroup(token)).expenseCount).toBe(3);
    const dates = (await listExpenses(token)).items.map((e) => e.expenseDate).sort();
    expect(dates).toEqual([start, occurrenceAt({ frequency: "monthly", anchorDate: start }, 1), occurrenceAt({ frequency: "monthly", anchorDate: start }, 2)]);
    expect(addDaysSafe(dates[2], 0)).toBe(todayIST());
  });

  it("AC-36/AC-37 (server): a new demo has the exact target balances; greedy 4, optimal 3; search finds Swiggy and Goa", async () => {
    const { token } = await createDemo();
    demoTokens.push(token);
    const g = await readGroup(token);
    expect(g.group.isDemo).toBe(true);
    const byName = Object.fromEntries(g.members.map((m) => [m.name.toLowerCase(), g.balances[m.id]]));
    expect(byName).toEqual(DEMO_TARGET_BALANCES);
    expect(g.plan.greedyCount).toBe(4);
    expect(g.plan.optimalCount).toBe(3);
    expect(g.expenseCount).toBeGreaterThanOrEqual(15);

    const swiggy = await searchExpenses(token, { q: "swiggy" });
    expect(swiggy.count).toBe(4);
    expect(swiggy.items.every((e) => /swiggy/i.test(e.description))).toBe(true);
    const goaFrom = addDaysSafe(todayIST(), -22);
    const goaTo = addDaysSafe(todayIST(), -18);
    const goa = await searchExpenses(token, { categories: ["Travel"], from: goaFrom, to: goaTo });
    expect(goa.count).toBe(4);
    expect(goa.items.every((e) => e.description.startsWith("Goa trip"))).toBe(true);
    const sumCats = Object.values(goa.perCategory).reduce((a, b) => a + b, 0);
    expect(sumCats).toBe(goa.totalBaseMinor);
    expect(settle(g.members.map((m) => ({ memberId: m.id, balance: g.balances[m.id] }))).payments).toHaveLength(3);

    // One monthly Flat rent rule: the seeded rent is its latest occurrence, next due in the future,
    // so opening the demo (readGroup above) created nothing.
    expect(g.expenseCount).toBe(15);
    const rules = await listRules(token);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ description: "Flat rent", frequency: "monthly", active: true });
    expect(rules[0].nextDue > todayIST()).toBe(true);
    const rent = (await listExpenses(token)).items.find((e) => e.description === "Flat rent")!;
    expect(rent.recurringRuleId).toBe(rules[0].id);
    expect(rules[0].anchorDate).toBe(rent.expenseDate);

    // When it does fall due, the key→id template mapping yields a valid expense.
    await sql`update public.recurring_rules set anchor_date = ${occurrenceAt({ frequency: "monthly", anchorDate: todayIST() }, -1)}, next_due = ${todayIST()} where id = ${rules[0].id}`;
    const after = await readGroup(token);
    expect(after.expenseCount).toBe(16);
    const generated = (await listExpenses(token)).items.find((e) => e.description === "Flat rent" && e.expenseDate === todayIST())!;
    expect(generated).toMatchObject({ amountMinor: 3000000, splitType: "shares" });
    expect(generated.payers).toHaveLength(5);
    expect((await listRules(token))[0].nextDue > todayIST()).toBe(true);
  });

  it("AC-38 (server): reset restores the seed; old demos are deleted lazily; non-demo reset is rejected", async () => {
    const { token } = await createDemo();
    demoTokens.push(token);
    const first = (await listExpenses(token)).items[0];
    await deleteExpense(token, first.id);
    expect((await readGroup(token)).balances).not.toEqual({});
    await resetDemo(token);
    const g = await readGroup(token);
    expect(Object.fromEntries(g.members.map((m) => [m.name.toLowerCase(), g.balances[m.id]]))).toEqual(DEMO_TARGET_BALANCES);
    expect((await listExpenses(token)).items.some((e) => e.description === first.description)).toBe(true);

    await sql`update public.groups set created_at = now() - interval '8 days' where share_token = ${token}`;
    const next = await createDemo();
    demoTokens.push(next.token);
    const [{ n }] = await sql`select count(*)::int as n from public.groups where share_token = ${token}`;
    expect(n).toBe(0);

    const { token: normal } = await createGroup({ name: `${TEST_PREFIX} not demo`, baseCurrency: "INR", memberNames: ["A", "B"] });
    tokens.push(normal);
    await expect(resetDemo(normal)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
