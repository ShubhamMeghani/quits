import { describe, expect, it } from "vitest";
import { matchName, nlUserText, parseNlModel, resolveNl, scoreNl, type NlContext, type NlModel } from "@/lib/nlparse";

const ctx: NlContext = {
  members: [
    { id: "aarav", name: "Aarav" },
    { id: "priya", name: "Priya" },
    { id: "rk", name: "Rahul Kumar" },
    { id: "rs", name: "Rahul Singh" },
    { id: "amit", name: "Amit" },
  ],
  meId: "aarav",
  baseCurrency: "INR",
  today: "2026-10-17",
};

const model = (m: Partial<NlModel>): NlModel => ({
  description: null,
  amount: null,
  currency: null,
  payer: null,
  participants: [],
  split_type: null,
  split_values: [],
  category: null,
  date: null,
  ...m,
});

describe("AC-47: name matching (R62)", () => {
  it("matches first or full names, ignoring case and spaces", () => {
    for (const raw of ["priya", "PRIYA", " Priya "]) expect(matchName(raw, ctx)).toEqual({ kind: "member", id: "priya" });
    expect(matchName("Amit", ctx)).toEqual({ kind: "member", id: "amit" });
    expect(matchName("Rahul Singh", ctx)).toEqual({ kind: "member", id: "rs" });
    expect(matchName("rahul  singh", ctx)).toEqual({ kind: "member", id: "rs" });
  });
  it("leaves ambiguous and unknown names blank and flagged; never adds members", () => {
    expect(matchName("Rahul", ctx)).toEqual({ kind: "ambiguous", raw: "Rahul" });
    expect(matchName("Karan", ctx)).toEqual({ kind: "unknown", raw: "Karan" });
    const r = resolveNl(model({ amount: 600, payer: "Rahul", participants: ["Karan", "me"] }), ctx);
    expect(r.prefill.payerId).toBeNull();
    expect(r.flags).toEqual(expect.arrayContaining([{ field: "payer", reason: "ambiguous", value: "Rahul" }, { field: "participants", reason: "unknown", value: "Karan" }]));
    expect(r.prefill.participantIds).toEqual(["aarav"]);
    expect(ctx.members).toHaveLength(5);
  });
  it("expands everyone / sab to all members", () => {
    const r = resolveNl(model({ amount: 450, payer: "maine", participants: ["sab"] }), ctx);
    expect(r.prefill.participantIds).toEqual(["aarav", "priya", "rk", "rs", "amit"]);
    expect(r.prefill.payerId).toBe("aarav");
  });
});

describe("AC-48: 'me' words mean the current member (R62)", () => {
  it("resolves me / I / maine / mujhe / mera in any case", () => {
    for (const w of ["me", "I", "Maine", "MUJHE", "mera"]) expect(matchName(w, ctx)).toEqual({ kind: "member", id: "aarav" });
  });
  it("is blank and flagged with no current member", () => {
    expect(matchName("me", { ...ctx, meId: null })).toEqual({ kind: "no-me", raw: "me" });
    const r = resolveNl(model({ amount: 100, payer: "me" }), { ...ctx, meId: null });
    expect(r.prefill.payerId).toBeNull();
    expect(r.flags).toContainEqual({ field: "payer", reason: "no-me", value: "me" });
  });
});

describe("AC-49: invalid values are left blank (R63)", () => {
  it("blanks exact amounts that don't sum to the total", () => {
    const r = resolveNl(model({ amount: 600, payer: "me", split_type: "exact", split_values: [{ name: "me", value: 300 }, { name: "Amit", value: 200 }] }), ctx);
    expect(r.prefill.splitType).toBe("exact");
    expect(r.prefill.splitValues).toBeNull();
    expect(r.flags).toContainEqual({ field: "split", reason: "invalid" });
  });
  it("keeps exact amounts that do sum", () => {
    const r = resolveNl(model({ amount: 600, payer: "me", split_type: "exact", split_values: [{ name: "me", value: 400 }, { name: "Amit", value: 200 }] }), ctx);
    expect(r.prefill.splitValues).toEqual({ aarav: "400.00", amit: "200.00" });
    expect(r.prefill.participantIds).toEqual(["aarav", "amit"]);
  });
  it("blanks percentages that don't add to 100; keeps valid shares", () => {
    const pct = resolveNl(model({ amount: 1000, payer: "me", split_type: "percent", split_values: [{ name: "me", value: 50 }, { name: "Priya", value: 40 }] }), ctx);
    expect(pct.prefill.splitValues).toBeNull();
    const ok = resolveNl(model({ amount: 1000, payer: "me", split_type: "percent", split_values: [{ name: "me", value: 50 }, { name: "Priya", value: 50 }] }), ctx);
    expect(ok.prefill.splitValues).toEqual({ aarav: "50", priya: "50" });
    const sh = resolveNl(model({ amount: 1000, payer: "me", split_type: "shares", split_values: [{ name: "me", value: 2 }, { name: "Priya", value: 1 }, { name: "Amit", value: 1 }] }), ctx);
    expect(sh.prefill.splitValues).toEqual({ aarav: "2", priya: "1", amit: "1" });
  });
  it("blanks a split that names an unknown participant", () => {
    const r = resolveNl(model({ amount: 900, payer: "me", split_type: "shares", split_values: [{ name: "me", value: 1 }, { name: "Karan", value: 2 }] }), ctx);
    expect(r.prefill.splitValues).toBeNull();
  });
  it("blanks zero/negative amounts, unknown categories, and future or year-old dates; falls back to the base currency", () => {
    for (const amount of [0, -5]) expect(resolveNl(model({ amount, payer: "me" }), ctx).prefill.amountMinor).toBeNull();
    const r = resolveNl(model({ amount: 450, currency: "XYZ", category: "Party", date: "2026-10-18", payer: "me" }), ctx);
    expect(r.prefill.currency).toBe("INR");
    expect(r.prefill.category).toBeNull();
    expect(r.prefill.date).toBeNull();
    expect(resolveNl(model({ amount: 1, date: "2025-10-16" }), ctx).prefill.date).toBeNull();
    expect(resolveNl(model({ amount: 1, date: "2026-02-30" }), ctx).prefill.date).toBeNull();
    expect(resolveNl(model({ amount: 1, date: "2026-10-16", category: "food & drinks" }), ctx).prefill).toMatchObject({ date: "2026-10-16", category: "Food & Drinks" });
    expect(resolveNl(model({ amount: 12.5, currency: "usd", payer: "me" }), ctx).prefill).toMatchObject({ currency: "USD", amountMinor: 1250 });
  });
});

describe("model output and prompt context", () => {
  it("parses the model JSON leniently and rejects garbage", () => {
    expect(parseNlModel('{"amount": 600, "payer": "Rahul", "participants": ["Amit", "me"], "split_type": "EQUAL"}')).toMatchObject({ amount: 600, split_type: "equal", split_values: [] });
    expect(parseNlModel("not json")).toBeNull();
    expect(parseNlModel({ amount: "600" })).toBeNull();
  });
  it("sends first names, base currency and today's weekday", () => {
    const t = nlUserText("Rahul paid 600", { memberNames: ["Aarav", "Rahul Singh"], baseCurrency: "INR", today: "2026-10-17" });
    expect(t).toContain("Members: Aarav, Rahul");
    expect(t).toContain("Today: 2026-10-17 (Saturday)");
    expect(t).toContain('Sentence: """Rahul paid 600"""');
  });
});

describe("NL eval metrics (R66)", () => {
  it("scores field accuracy, exact match and abstention", () => {
    const good = resolveNl(model({ amount: 600, payer: "Amit", participants: ["Amit", "me"] }), ctx);
    const ambiguous = resolveNl(model({ amount: 500, payer: "Rahul", participants: ["Rahul", "me"] }), ctx);
    const s = scoreNl([
      { id: "a", gold: { amountMinor: 60000, payerId: "amit", participantIds: ["aarav", "amit"], splitType: "equal" }, predicted: good, ambiguous: false, blank: [], latencyMs: 1000 },
      { id: "b", gold: { amountMinor: 50000, payerId: null, participantIds: null, splitType: "equal" }, predicted: ambiguous, ambiguous: true, blank: ["payer"], latencyMs: 3000 },
      { id: "c", gold: { amountMinor: 100, payerId: "aarav", participantIds: null, splitType: "equal" }, predicted: null, ambiguous: false, blank: [], latencyMs: 15000 },
    ]);
    expect(s.amountAccuracy).toBe(0.667);
    expect(s.payerAccuracy).toBe(0.667);
    expect(s.exactMatchRate).toBe(0.333);
    expect(s.ambiguousN).toBe(1);
    expect(s.abstentionRate).toBe(1);
    expect(s.meanLatencySec).toBe(6.333);
    expect(s.perSentence[2].error).toBe(true);
  });
});
