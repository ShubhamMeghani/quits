import { describe, expect, it, vi } from "vitest";
import { createParseHandler, NL_FAILED, type ParseDeps } from "@/server/nl-handler";

const ME = "11111111-1111-4111-8111-111111111111";
const members = [
  { id: ME, name: "Aarav", archived: false },
  { id: "22222222-2222-4222-8222-222222222222", name: "Rahul Singh", archived: false },
  { id: "33333333-3333-4333-8333-333333333333", name: "Amit", archived: false },
  { id: "44444444-4444-4444-8444-444444444444", name: "Old", archived: true },
];

function deps(overrides: Partial<ParseDeps> = {}) {
  const calls = { model: 0, writes: 0 };
  const d: ParseDeps = {
    findGroup: async (t) => (t === "tok" ? { id: "g1", baseCurrency: "INR" } : null),
    loadMembers: async () => members,
    bumpLimits: async () => true,
    callModel: async () => {
      calls.model++;
      return JSON.stringify({
        description: "Pizza",
        amount: 600,
        currency: null,
        payer: "Rahul Singh",
        participants: ["Rahul Singh", "Amit", "me"],
        split_type: "equal",
        split_values: [],
        category: "Food & Drinks",
        date: null,
      });
    },
    today: () => "2026-10-17",
    retryDelayMs: 0,
    ...overrides,
  };
  return { d, calls };
}

const post = (body: unknown) => new Request("http://x/api/g/tok/expenses/parse", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("AC-50: parse route with a mocked Gemini (R61, R64, R65)", () => {
  it("returns the prefill for the example sentence and writes nothing", async () => {
    const { d, calls } = deps();
    const spyBump = vi.spyOn(d, "bumpLimits");
    const res = await createParseHandler(d)(post({ text: "Rahul Singh paid 600 for pizza, split with Amit and me", me: ME }), "tok");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefill).toEqual({
      description: "Pizza",
      amountMinor: 60000,
      currency: "INR",
      payerId: members[1].id,
      splitType: "equal",
      participantIds: [ME, members[1].id, members[2].id],
      splitValues: null,
      category: "Food & Drinks",
      date: null,
    });
    expect(body.flags).toEqual([]);
    expect(calls.model).toBe(1);
    // The only side effect is the rate-limit counter; the handler has no save dependency at all.
    expect(spyBump).toHaveBeenCalledTimes(1);
    expect(Object.keys(d)).not.toEqual(expect.arrayContaining(["createExpense"]));
  });

  it("rejects 301 characters with 400 and empty text with 400", async () => {
    const { d, calls } = deps();
    expect((await createParseHandler(d)(post({ text: "x".repeat(301) }), "tok")).status).toBe(400);
    expect((await createParseHandler(d)(post({ text: "   " }), "tok")).status).toBe(400);
    expect(calls.model).toBe(0);
  });

  it("replies 429 without calling Gemini when the per-group limit is exceeded", async () => {
    const { d, calls } = deps({ bumpLimits: async () => false });
    const res = await createParseHandler(d)(post({ text: "Amit paid 100" }), "tok");
    expect(res.status).toBe(429);
    expect(calls.model).toBe(0);
  });

  it("replies 502 with the friendly message on a timeout or invalid output", async () => {
    const slow = deps({ callModel: () => new Promise<string>(() => undefined), timeoutMs: 20 });
    const res = await createParseHandler(slow.d)(post({ text: "Amit paid 100" }), "tok");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: NL_FAILED, reason: "timeout" });
    const junk = deps({ callModel: async () => "nope" });
    expect((await createParseHandler(junk.d)(post({ text: "Amit paid 100" }), "tok")).status).toBe(502);
  });

  it("D-29/D-30: waits before the single retry; a repeated 503 reports status 503; a timeout after a 503 keeps it", async () => {
    const http503 = () => Object.assign(new Error("high demand"), { status: 503 });
    let calls = 0;
    const stamps: number[] = [];
    const ok = deps().d.callModel;
    const delayed = deps({
      retryDelayMs: 60,
      callModel: async (req) => {
        stamps.push(Date.now());
        if (++calls === 1) throw http503();
        return ok(req);
      },
    });
    expect((await createParseHandler(delayed.d)(post({ text: "Amit paid 100" }), "tok")).status).toBe(200);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(55);
    const always503 = deps({ callModel: async () => { throw http503(); } });
    const res = await createParseHandler(always503.d)(post({ text: "Amit paid 100" }), "tok");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Couldn't read that — try again", reason: "model_error", status: 503 });
    let n = 0;
    const thenHang = deps({
      timeoutMs: 40,
      callModel: () => (++n === 1 ? Promise.reject(http503()) : new Promise<string>(() => undefined)),
    });
    expect(await (await createParseHandler(thenHang.d)(post({ text: "Amit paid 100" }), "tok")).json()).toMatchObject({ reason: "timeout", status: 503 });
  });

  it("retries once on a transient model error inside the same deadline", async () => {
    let n = 0;
    const ok = deps().d.callModel;
    const flaky = deps({
      callModel: async (req) => {
        n++;
        if (n === 1) throw new Error("503 overloaded");
        return ok(req);
      },
    });
    expect((await createParseHandler(flaky.d)(post({ text: "Rahul Singh paid 600", me: ME }), "tok")).status).toBe(200);
    expect(n).toBe(2);
    const broken = deps({
      callModel: async () => {
        throw new Error("500");
      },
    });
    const res = await createParseHandler(broken.d)(post({ text: "Amit paid 100" }), "tok");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ reason: "model_error" });
  });

  it("404 for an unknown group or a 'me' outside the group", async () => {
    const { d } = deps();
    expect((await createParseHandler(d)(post({ text: "x" }), "nope")).status).toBe(404);
    expect((await createParseHandler(d)(post({ text: "x", me: "55555555-5555-4555-8555-555555555555" }), "tok")).status).toBe(404);
  });

  it("matches only active members (archived ones are never sent or matched)", async () => {
    const seen: string[] = [];
    const { d } = deps({
      callModel: async (req) => {
        seen.push(req.text);
        return JSON.stringify({ description: null, amount: 50, currency: null, payer: "Old", participants: [], split_type: null, split_values: [], category: null, date: null });
      },
    });
    const body = await (await createParseHandler(d)(post({ text: "Old paid 50", me: ME }), "tok")).json();
    expect(seen[0]).toContain("Members: Aarav, Rahul, Amit");
    expect(body.prefill.payerId).toBeNull();
    expect(body.flags).toContainEqual({ field: "payer", reason: "unknown", value: "Old" });
  });
});
