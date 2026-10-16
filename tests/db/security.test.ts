import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteGroups, hasDb, sqlClient, TEST_PREFIX, type Sql } from "./helpers";
import { createGroup, readGroup, updateGroupSettings } from "@/server/groups";
import { updateMember } from "@/server/members";
import { createExpense, deleteExpense, getExpense, updateExpense } from "@/server/expenses";
import { createSettlement, deleteSettlement } from "@/server/settlements";
import { db } from "@/server/db";

describe.skipIf(!hasDb)("DB: RLS and group ownership (R54, R55)", () => {
  let sql: Sql;
  const tokens: string[] = [];
  let X = { token: "", id: "", a: "", b: "" };
  let Y = { token: "", id: "", a: "", b: "", expense: "", settlement: "" };

  beforeAll(async () => {
    sql = sqlClient();
    const gx = await createGroup({ name: `${TEST_PREFIX} X`, baseCurrency: "INR", memberNames: ["Xa", "Xb"] });
    const gy = await createGroup({ name: `${TEST_PREFIX} Y`, baseCurrency: "INR", memberNames: ["Ya", "Yb"] });
    tokens.push(gx.token, gy.token);
    const vx = await readGroup(gx.token);
    const vy = await readGroup(gy.token);
    X = { token: gx.token, id: vx.group.id, a: vx.members[0].id, b: vx.members[1].id };
    const ye = await createExpense(gy.token, {
      description: "Y only",
      category: "Other",
      expenseDate: "2026-10-01",
      currency: "INR",
      amountMinor: 1000,
      payers: { [vy.members[0].id]: 1000 },
      split: { type: "equal", participants: [vy.members[0].id, vy.members[1].id] },
    });
    const ys = await createSettlement(gy.token, {
      fromMemberId: vy.members[1].id,
      toMemberId: vy.members[0].id,
      amountMinor: 100,
      settledOn: "2026-10-02",
    });
    Y = { token: gy.token, id: vy.group.id, a: vy.members[0].id, b: vy.members[1].id, expense: ye.id, settlement: ys.id };
  });

  afterAll(async () => {
    await deleteGroups(sql, tokens);
    await sql.end();
  });

  const counts = async () => {
    const [r] = await sql`select
      (select count(*)::int from public.expenses) as e,
      (select count(*)::int from public.settlements) as s,
      (select count(*)::int from public.expenses where deleted_at is not null) as d`;
    return r;
  };

  it("AC-43: an expense in group X with a member of group Y → 404 and no row", async () => {
    const before = await counts();
    await expect(
      createExpense(X.token, {
        description: "Cross",
        category: "Other",
        expenseDate: "2026-10-03",
        currency: "INR",
        amountMinor: 1000,
        payers: { [Y.a]: 1000 },
        split: { type: "equal", participants: [X.a, X.b] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(
      createExpense(X.token, {
        description: "Cross split",
        category: "Other",
        expenseDate: "2026-10-03",
        currency: "INR",
        amountMinor: 1000,
        payers: { [X.a]: 1000 },
        split: { type: "equal", participants: [X.a, Y.b] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await counts()).toEqual(before);
  });

  it("AC-43: deleting group Y's expense through group X's token → 404, nothing changes", async () => {
    const before = await counts();
    await expect(deleteExpense(X.token, Y.expense)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(getExpense(X.token, Y.expense)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateExpense(X.token, Y.expense, {
        description: "Hijack",
        category: "Other",
        expenseDate: "2026-10-01",
        currency: "INR",
        amountMinor: 1000,
        payers: { [X.a]: 1000 },
        split: { type: "equal", participants: [X.a] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await counts()).toEqual(before);
    expect((await getExpense(Y.token, Y.expense)).deletedAt).toBeNull();
  });

  it("cross-group settlements, members, actors and default splits → 404", async () => {
    const before = await counts();
    await expect(createSettlement(X.token, { fromMemberId: X.a, toMemberId: Y.a, amountMinor: 100, settledOn: "2026-10-03" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteSettlement(X.token, Y.settlement)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateMember(X.token, Y.a, { name: "Renamed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createExpense(X.token, {
        description: "Bad actor",
        category: "Other",
        expenseDate: "2026-10-03",
        currency: "INR",
        amountMinor: 1000,
        payers: { [X.a]: 1000 },
        split: { type: "equal", participants: [X.a] },
      }, Y.a),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateGroupSettings(X.token, { name: `${TEST_PREFIX} X`, baseCurrency: "INR", defaultSplit: { type: "equal", participants: [Y.a], weights: {} } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await counts()).toEqual(before);
    expect((await readGroup(Y.token)).members[0].name).toBe("Ya");
  });

  it("the RPCs themselves reject foreign member ids (defence in depth)", async () => {
    const { error } = await db().rpc("create_settlement", {
      p_group_id: X.id,
      p_settlement: { from_member_id: X.a, to_member_id: Y.a, amount_minor: 100, settled_on: "2026-10-03" },
      p_activity: null,
    });
    expect(error?.message).toContain("NOT_FOUND");
    const del = await db().rpc("set_expense_deleted", { p_group_id: X.id, p_expense_id: Y.expense, p_deleted: true, p_activity: null });
    expect(del.error?.message).toContain("NOT_FOUND");
  });

  it("AC-41 (SQL part): every public table has RLS enabled", async () => {
    const rows = await sql`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rows).toHaveLength(0);
  });

  it("AC-41: the anon role (what the publishable key uses) reads nothing from any table", async () => {
    const tables = await sql`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`;
    expect(tables.length).toBeGreaterThanOrEqual(14);
    for (const { relname } of tables) {
      let rows: number | "denied";
      try {
        rows = await sql.begin(async (tx) => {
          await tx`set local role anon`;
          const r = await tx`select count(*)::int as n from ${tx("public." + relname)}`;
          return r[0].n as number;
        });
      } catch (e) {
        expect(String((e as Error).message)).toMatch(/permission denied/);
        rows = "denied";
      }
      expect([0, "denied"]).toContain(rows);
    }
  });

  it("the anon role cannot execute the write functions", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select public.create_group('AAAAAAAAAAAAAAAAAAAAAA', 'x', 'INR', array['a','b'])`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
