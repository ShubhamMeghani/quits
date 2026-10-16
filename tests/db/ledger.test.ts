import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteGroups, hasDb, sqlClient, TEST_PREFIX, type Sql } from "./helpers";
import { createGroup, listActivity, readGroup, updateGroupSettings } from "@/server/groups";
import { addMember } from "@/server/members";
import { createExpense, deleteExpense, getExpense, listExpenses, restoreExpense, updateExpense } from "@/server/expenses";
import { createSettlement } from "@/server/settlements";
import { findGroupByToken } from "@/server/context";
import { db } from "@/server/db";

describe.skipIf(!hasDb)("DB: ledger, invariants, activity (R8, R11, R14, R15, R42)", () => {
  let sql: Sql;
  const tokens: string[] = [];
  let token = "";
  let A = "";
  let B = "";
  let C = "";

  beforeAll(async () => {
    sql = sqlClient();
    ({ token } = await createGroup({ name: `${TEST_PREFIX} ledger`, baseCurrency: "INR", memberNames: ["Aarav", "Priya", "Rohan"] }));
    tokens.push(token);
    const g = await readGroup(token);
    [A, B, C] = g.members.map((m) => m.id);
  });

  afterAll(async () => {
    await deleteGroups(sql, tokens);
    await sql.end();
  });

  it("resolves tokens; unknown and malformed tokens give null (R1)", async () => {
    expect((await findGroupByToken(token))?.name).toBe(`${TEST_PREFIX} ledger`);
    expect(await findGroupByToken("doesnotexist")).toBeNull();
    expect(await findGroupByToken("AAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("stores expenses of every split type and keeps Σ balances = 0 (AC-4, AC-5 against the DB)", async () => {
    await createExpense(token, {
      description: "Dinner",
      category: "Food & Drinks",
      expenseDate: "2026-10-01",
      currency: "INR",
      amountMinor: 30000,
      payers: { [A]: 30000 },
      split: { type: "equal", participants: [A, B, C] },
    }, A);
    let g = await readGroup(token);
    expect(g.balances).toEqual({ [A]: 20000, [B]: -10000, [C]: -10000 });

    await createExpense(token, {
      description: "Rent",
      category: "Rent",
      expenseDate: "2026-10-02",
      currency: "INR",
      amountMinor: 1001,
      payers: { [B]: 600, [C]: 401 },
      split: { type: "shares", shares: { [A]: 2, [B]: 1, [C]: 1 } },
    }, B);
    await createExpense(token, {
      description: "Scooter",
      category: "Transport",
      expenseDate: "2026-10-03",
      currency: "INR",
      amountMinor: 999,
      payers: { [C]: 999 },
      split: { type: "percent", basisPoints: { [A]: 5000, [B]: 2500, [C]: 2500 } },
    });
    await createExpense(token, {
      description: "Power",
      category: "Utilities",
      expenseDate: "2026-10-04",
      currency: "INR",
      amountMinor: 5000,
      payers: { [A]: 5000 },
      split: { type: "exact", amounts: { [A]: 1000, [B]: 1500, [C]: 2500 } },
    });
    const usd = await createExpense(token, {
      description: "Subscription",
      category: "Education",
      expenseDate: "2026-10-05",
      currency: "USD",
      amountMinor: 1234,
      payers: { [A]: 1234 },
      split: { type: "equal", participants: [A, B, C] },
      manualRate: "83.4567",
    });
    await createSettlement(token, { fromMemberId: B, toMemberId: A, amountMinor: 5000, settledOn: "2026-10-06", method: "upi" }, B);

    const e = await getExpense(token, usd.id);
    expect(e).toMatchObject({ fxRate: "83.4567", fxSource: "manual", baseAmountMinor: 102986, splitType: "equal" });
    expect(e.splits.map((s) => s.owedBaseMinor)).toEqual([34329, 34329, 34328]);

    g = await readGroup(token);
    expect(Object.values(g.balances).reduce((a, b) => a + b, 0)).toBe(0);
    expect(g.expenseCount).toBe(5);

    const bad = await sql`
      select e.id from public.expenses e
      join public.groups g on g.id = e.group_id
      where g.share_token = ${token}
        and (e.amount_minor <> (select coalesce(sum(amount_minor), 0) from public.expense_payers p where p.expense_id = e.id)
          or e.amount_minor <> (select coalesce(sum(owed_minor), 0) from public.expense_splits s where s.expense_id = e.id)
          or e.base_amount_minor <> (select coalesce(sum(base_amount_minor), 0) from public.expense_payers p where p.expense_id = e.id)
          or e.base_amount_minor <> (select coalesce(sum(owed_base_minor), 0) from public.expense_splits s where s.expense_id = e.id))`;
    expect(bad).toHaveLength(0);
  });

  it("rejects writes that break the per-expense invariant inside the RPC (R14)", async () => {
    const g = await readGroup(token);
    const before = await sql`select count(*)::int as n from public.expenses where group_id = ${g.group.id}`;
    const { error } = await db().rpc("create_expense", {
      p_group_id: g.group.id,
      p_expense: {
        description: "Broken",
        category: "Other",
        expense_date: "2026-10-07",
        currency: "INR",
        amount_minor: 1000,
        fx_rate: "1",
        fx_rate_date: "2026-10-07",
        fx_source: "identity",
        base_amount_minor: 1000,
        split_type: "equal",
      },
      p_payers: [{ member_id: A, amount_minor: 1000, base_amount_minor: 1000 }],
      p_splits: [{ member_id: B, input_value: null, owed_minor: 999, owed_base_minor: 999 }],
      p_activity: null,
    });
    expect(error?.message).toContain("INVARIANT_VIOLATION");
    const after = await sql`select count(*)::int as n from public.expenses where group_id = ${g.group.id}`;
    expect(after[0].n).toBe(before[0].n);
  });

  it("AC-29 (server part): editing ₹500 → ₹600 logs the change with the actor; delete removes it from balances", async () => {
    const { id } = await createExpense(token, {
      description: "Snacks",
      category: "Food & Drinks",
      expenseDate: "2026-10-08",
      currency: "INR",
      amountMinor: 50000,
      payers: { [A]: 50000 },
      split: { type: "equal", participants: [A, B] },
    }, A);
    await updateExpense(token, id, {
      description: "Snacks",
      category: "Food & Drinks",
      expenseDate: "2026-10-08",
      currency: "INR",
      amountMinor: 60000,
      payers: { [A]: 60000 },
      split: { type: "equal", participants: [A, B] },
    }, B);
    const act = await listActivity(token);
    const edit = act.items.find((x) => x.action === "expense.updated");
    expect(edit?.actorName).toBe("Priya");
    expect(edit?.summary).toContain("Amount ₹500.00 → ₹600.00");

    const before = (await readGroup(token)).balances;
    await deleteExpense(token, id, A);
    const afterDelete = await readGroup(token);
    expect(afterDelete.balances[A]).toBe(before[A] - 30000);
    expect((await listExpenses(token)).items.some((x) => x.id === id)).toBe(false);
    expect((await listActivity(token)).items[0]).toMatchObject({ action: "expense.deleted", actorName: "Aarav" });

    await restoreExpense(token, id, A);
    expect((await readGroup(token)).balances).toEqual(before);
    await expect(restoreExpense(token, id, A)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the stored rate when only the description changes; re-resolves when the date changes (R16)", async () => {
    const { id } = await createExpense(token, {
      description: "Hostel",
      category: "Travel",
      expenseDate: "2026-10-01",
      currency: "USD",
      amountMinor: 1000,
      payers: { [A]: 1000 },
      split: { type: "equal", participants: [A, B] },
      manualRate: "90",
    });
    const base = { category: "Travel" as const, currency: "USD", amountMinor: 1000, payers: { [A]: 1000 }, split: { type: "equal" as const, participants: [A, B] } };
    await updateExpense(token, id, { ...base, description: "Hostel stay", expenseDate: "2026-10-01" });
    expect((await getExpense(token, id)).fxRate).toBe("90");
    await updateExpense(token, id, { ...base, description: "Hostel stay", expenseDate: "2026-10-02", manualRate: "91.5" });
    expect(await getExpense(token, id)).toMatchObject({ fxRate: "91.5", fxRateDate: "2026-10-02", fxSource: "manual" });
  });

  it("rejects duplicate member names and invalid UPI IDs (R6)", async () => {
    await expect(addMember(token, { name: "priya" })).rejects.toMatchObject({ code: "NAME_TAKEN", message: "Name already used" });
    await expect(addMember(token, { name: "Kabir", upiId: "kabir" })).rejects.toMatchObject({ code: "VALIDATION", message: "Invalid UPI ID" });
    const { id } = await addMember(token, { name: "Kabir", upiId: "kabir@oksbi" }, A);
    const g = await readGroup(token);
    expect(g.members.at(-1)).toMatchObject({ id, name: "Kabir", upiId: "kabir@oksbi", displayOrder: 4 });
  });

  it("locks the base currency once the group has expenses (R15)", async () => {
    await expect(updateGroupSettings(token, { name: `${TEST_PREFIX} ledger`, baseCurrency: "USD", defaultSplit: null })).rejects.toMatchObject({
      code: "BASE_CURRENCY_LOCKED",
    });
    const fresh = await createGroup({ name: `${TEST_PREFIX} empty`, baseCurrency: "INR", memberNames: ["X", "Y"] });
    tokens.push(fresh.token);
    await updateGroupSettings(fresh.token, { name: `${TEST_PREFIX} empty`, baseCurrency: "EUR", defaultSplit: null });
    expect((await readGroup(fresh.token)).group.baseCurrency).toBe("EUR");
  });

  it("stores the default split (R9)", async () => {
    await updateGroupSettings(token, {
      name: `${TEST_PREFIX} ledger`,
      baseCurrency: "INR",
      defaultSplit: { type: "shares", participants: [A, B, C], weights: { [A]: 2, [B]: 1, [C]: 1 } },
    }, A);
    expect((await readGroup(token)).group.defaultSplit).toEqual({
      type: "shares",
      participants: [A, B, C],
      weights: { [A]: 2, [B]: 1, [C]: 1 },
    });
  });
});
