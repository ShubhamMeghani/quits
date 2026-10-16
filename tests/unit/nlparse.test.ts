import { describe, expect, it } from "vitest";
import { matchName, nlUserText, owedBySplit, parseNlModel, resolveNl, scoreNl, splitsMatch, type NlContext, type NlModel } from "@/lib/nlparse";

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
  it("expands everyone / all / sab / sabhi to all members (D-23)", () => {
    for (const w of ["Everyone", "everybody", "ALL", "all of us", "sab", "Sabhi", "sab log", "hum sab"]) expect(matchName(w, ctx)).toEqual({ kind: "all" });
    const r = resolveNl(model({ amount: 450, payer: "maine", participants: ["sab"] }), ctx);
    expect(r.prefill.participantIds).toEqual(["aarav", "priya", "rk", "rs", "amit"]);
    expect(r.prefill.payerId).toBe("aarav");
  });
});

describe("AC-48: 'me' words mean the current member (R62)", () => {
  it("resolves me / I / main / maine / mujhe / mera in any case (D-24)", () => {
    for (const w of ["me", "I", "Main", "MAIN", "Maine", "MUJHE", "mera"]) expect(matchName(w, ctx)).toEqual({ kind: "member", id: "aarav" });
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
  it("P3: two names for the same person in a split leave the split blank (never added together)", () => {
    // human-05 run 1: the model listed both "me" and "Aarav", and the shares were summed to 3.
    const r = resolveNl(
      model({
        amount: 140,
        payer: null,
        split_type: "shares",
        split_values: [
          { name: "me", value: 2 },
          { name: "Priya", value: 2 },
          { name: "Amit", value: 1 },
          { name: "Aarav", value: 1 },
        ],
      }),
      ctx,
    );
    expect(r.prefill.splitValues).toBeNull();
    expect(r.flags).toContainEqual({ field: "split", reason: "duplicate", value: "Aarav" });
    expect(r.flags).toContainEqual({ field: "split", reason: "invalid" });
    const exact = resolveNl(model({ amount: 600, payer: "me", split_type: "exact", split_values: [{ name: "Priya", value: 300 }, { name: "PRIYA", value: 300 }] }), ctx);
    expect(exact.prefill.splitValues).toBeNull();
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

describe("D-27: splits match by what each participant owes", () => {
  const order = ["aarav", "priya", "rahul", "amit", "sneha"];
  const shares = { amountMinor: 14000, type: "shares" as const, participants: order, values: { aarav: "2", priya: "2", rahul: "1", amit: "1", sneha: "1" } };
  it("shares 2:2:1:1:1 of ₹140 equals exact ₹40/40/20/20/20", () => {
    const exact = { amountMinor: 14000, type: "exact" as const, participants: order, values: { aarav: "40.00", priya: "40.00", rahul: "20.00", amit: "20.00", sneha: "20.00" } };
    expect(owedBySplit(shares, order)).toEqual({ aarav: 4000, priya: 4000, rahul: 2000, amit: 2000, sneha: 2000 });
    expect(splitsMatch(shares, exact, order)).toBe(true);
    expect(splitsMatch(shares, { ...exact, values: { ...exact.values, aarav: "50.00", priya: "30.00" } }, order)).toBe(false);
  });
  it("equal among three equals shares 1:1:1, and percent 33.34/33.33/33.33 only when the paise coincide", () => {
    const eq = { amountMinor: 10000, type: "equal" as const, participants: ["aarav", "priya", "rahul"], values: null };
    expect(splitsMatch(eq, { amountMinor: 10000, type: "shares", participants: [], values: { aarav: "1", priya: "1", rahul: "1" } }, order)).toBe(true);
    // ₹100: equal → 3334/3333/3333 paise, and so does 33.34/33.33/33.33%.
    expect(splitsMatch(eq, { amountMinor: 10000, type: "percent", participants: [], values: { aarav: "33.34", priya: "33.33", rahul: "33.33" } }, order)).toBe(true);
    // ₹300: equal → 10000 each, but 33.34% → 10002/9999/9999, so they differ.
    expect(splitsMatch({ ...eq, amountMinor: 30000 }, { amountMinor: 30000, type: "percent", participants: [], values: { aarav: "33.34", priya: "33.33", rahul: "33.33" } }, order)).toBe(false);
    expect(splitsMatch(eq, { ...eq, participants: ["aarav", "priya"] }, order)).toBe(false);
  });
  it("a blank split matches only a blank split; without an amount the shape must match", () => {
    const blank = { amountMinor: 90000, type: "exact" as const, participants: ["aarav", "priya"], values: null };
    expect(owedBySplit(blank, order)).toBe("blank");
    expect(splitsMatch(blank, { ...blank }, order)).toBe(true);
    expect(splitsMatch(blank, { ...blank, values: { aarav: "500.00", priya: "400.00" } }, order)).toBe(false);
    const noAmount = { amountMinor: null, type: "equal" as const, participants: ["aarav", "priya"], values: null };
    expect(splitsMatch(noAmount, { ...noAmount }, order)).toBe(true);
    expect(splitsMatch(noAmount, { ...noAmount, participants: ["aarav"] }, order)).toBe(false);
  });
  it("scoreNl counts an equivalent split of another type as an exact match but not a split-type match", () => {
    const predicted = resolveNl(model({ amount: 140, payer: null, split_type: "exact", split_values: [{ name: "me", value: 40 }, { name: "Priya", value: 40 }, { name: "Rahul Kumar", value: 20 }, { name: "Amit", value: 20 }, { name: "Rahul Singh", value: 20 }] }), ctx);
    const s = scoreNl([
      {
        id: "cold-drinks",
        gold: { amountMinor: 14000, payerId: null, participantIds: ["aarav", "priya", "rk", "amit", "rs"], splitType: "shares", splitValues: { aarav: "2", priya: "2", rk: "1", amit: "1", rs: "1" } },
        predicted,
        ambiguous: true,
        blank: ["payer"],
        latencyMs: 1000,
        memberOrder: ["aarav", "priya", "rk", "rs", "amit"],
      },
    ]);
    expect(s.perSentence[0]).toMatchObject({ amount: true, payer: true, participants: true, splitType: false, exact: true, abstained: true });
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
