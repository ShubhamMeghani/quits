import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteGroups, hasDb, sqlClient, TEST_PREFIX, type Sql } from "./helpers";
import { createGroup, listActivity, readGroup } from "@/server/groups";
import { getExpense } from "@/server/expenses";
import { findGroupByToken } from "@/server/context";
import { bumpScanLimits, createReceiptDraft, finalizeReceipt, getReceipt, saveReceiptDraft } from "@/server/receipts";

describe.skipIf(!hasDb)("DB: receipts (R30, R33–R36)", () => {
  let sql: Sql;
  const tokens: string[] = [];
  let token = "";
  let A = "";
  let B = "";
  let C = "";

  beforeAll(async () => {
    sql = sqlClient();
    ({ token } = await createGroup({ name: `${TEST_PREFIX} receipts`, baseCurrency: "INR", memberNames: ["A", "B", "C"] }));
    tokens.push(token);
    [A, B, C] = (await readGroup(token)).members.map((m) => m.id);
  });

  afterAll(async () => {
    await sql`delete from public.rate_limits where bucket like 'scan:group:%' and bucket in (select 'scan:group:' || id from public.groups where share_token in ${sql(tokens)})`;
    await deleteGroups(sql, tokens);
    await sql.end();
  });

  const base = () => ({
    merchant: "Test Cafe",
    date: "2026-10-12",
    currency: "INR",
    items: [
      { name: "Pizza", quantity: 1, amountMinor: 40000, assignees: [A, B] },
      { name: "Coke", quantity: 1, amountMinor: 10000, assignees: [A] },
      { name: "Pasta", quantity: 1, amountMinor: 30000, assignees: [C] },
    ],
    taxMinor: 4000,
    serviceMinor: 0,
    tipMinor: 0,
    discountMinor: 0,
    roundOffMinor: 0,
    totalMinor: 84500,
  });

  it("AC-18/AC-22 (server): finalizing uses the printed total and allocates the remainder by subtotal", async () => {
    const group = (await findGroupByToken(token))!;
    const id = await createReceiptDraft(group, null);
    await saveReceiptDraft(token, id, base());
    const draft = await getReceipt(token, id);
    expect(draft).toMatchObject({ status: "draft", totalMinor: 84500, diffMinor: 500 });
    expect(draft.items.map((i) => i.assignees.length)).toEqual([2, 1, 1]);

    const { expenseId } = await finalizeReceipt(token, id, { receipt: base(), description: "Test Cafe", category: "Food & Drinks", expenseDate: "2026-10-12", payerId: B }, A);
    const e = await getExpense(token, expenseId);
    expect(e).toMatchObject({ splitType: "itemized", amountMinor: 84500, baseAmountMinor: 84500, receiptId: id });
    expect(Object.fromEntries(e.splits.map((s) => [s.memberId, s.owedMinor]))).toEqual({ [A]: 31688, [B]: 21125, [C]: 31687 });
    expect(e.payers).toEqual([{ memberId: B, amountMinor: 84500, baseAmountMinor: 84500 }]);
    expect((await getReceipt(token, id)).status).toBe("finalized");
    const act = await listActivity(token);
    expect(act.items[0]).toMatchObject({ action: "receipt.finalized", actorName: "A" });
    expect(act.items[0].summary).toContain("total mismatch");
    const g = await readGroup(token);
    expect(Object.values(g.balances).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("a finalized receipt cannot be edited or finalized again", async () => {
    const group = (await findGroupByToken(token))!;
    const id = await createReceiptDraft(group, null);
    await finalizeReceipt(token, id, { receipt: base(), description: "Once", category: "Food & Drinks", expenseDate: "2026-10-12", payerId: A });
    await expect(saveReceiptDraft(token, id, base())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      finalizeReceipt(token, id, { receipt: base(), description: "Twice", category: "Food & Drinks", expenseDate: "2026-10-12", payerId: A }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("R34: an unassigned item blocks finalizing and nothing is created", async () => {
    const group = (await findGroupByToken(token))!;
    const id = await createReceiptDraft(group, null);
    const r = base();
    r.items[1].assignees = [];
    const [{ n: before }] = await sql`select count(*)::int as n from public.expenses e join public.groups g on g.id = e.group_id where g.share_token = ${token}`;
    await expect(finalizeReceipt(token, id, { receipt: r, description: "X", category: "Food & Drinks", expenseDate: "2026-10-12", payerId: A })).rejects.toMatchObject({
      code: "VALIDATION",
      message: 'Choose who had "Coke"',
    });
    const [{ n: after }] = await sql`select count(*)::int as n from public.expenses e join public.groups g on g.id = e.group_id where g.share_token = ${token}`;
    expect(after).toBe(before);
  });

  it("R55: claims for a member of another group are rejected", async () => {
    const other = await createGroup({ name: `${TEST_PREFIX} other`, baseCurrency: "INR", memberNames: ["X", "Y"] });
    tokens.push(other.token);
    const X = (await readGroup(other.token)).members[0].id;
    const group = (await findGroupByToken(token))!;
    const id = await createReceiptDraft(group, null);
    const r = base();
    r.items[0].assignees = [X];
    await expect(saveReceiptDraft(token, id, r)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getReceipt(other.token, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("R30: the daily scan counter allows the limit and then refuses", async () => {
    const group = (await findGroupByToken(token))!;
    process.env.SCAN_LIMIT_PER_GROUP = "2";
    try {
      expect(await bumpScanLimits(group.id)).toBe(true);
      expect(await bumpScanLimits(group.id)).toBe(true);
      expect(await bumpScanLimits(group.id)).toBe(false);
    } finally {
      delete process.env.SCAN_LIMIT_PER_GROUP;
    }
  });
});
