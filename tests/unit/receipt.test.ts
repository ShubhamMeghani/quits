import { describe, expect, it } from "vitest";
import {
  allocateItemized,
  extractReceipt,
  isMismatch,
  matchItems,
  nameSimilarity,
  parseModelReceipt,
  receiptDiff,
  scoreEval,
  type ReceiptData,
} from "@/lib/receipt";

const receipt = (items: number[], extras: Partial<ReceiptData> = {}): ReceiptData => ({
  merchant: null,
  date: null,
  currency: "INR",
  items: items.map((amountMinor, i) => ({ name: `item ${i}`, quantity: 1, amountMinor })),
  taxMinor: 0,
  serviceMinor: 0,
  tipMinor: 0,
  discountMinor: 0,
  roundOffMinor: 0,
  totalMinor: 0,
  ...extras,
});

describe("reconciliation (R33)", () => {
  it("AC-17: items [25000, 18000], tax 2150: total 45150 → diff 0; 45300 → +150 flagged", () => {
    expect(receiptDiff(receipt([25000, 18000], { taxMinor: 2150, totalMinor: 45150 }))).toBe(0);
    const d = receiptDiff(receipt([25000, 18000], { taxMinor: 2150, totalMinor: 45300 }));
    expect(d).toBe(150);
    expect(isMismatch(d)).toBe(true);
  });
  it("AC-17: |diff| = 100 is not flagged, 101 is", () => {
    expect(isMismatch(100)).toBe(false);
    expect(isMismatch(-100)).toBe(false);
    expect(isMismatch(101)).toBe(true);
    expect(isMismatch(-101)).toBe(true);
  });
  it("includes service, tip, discount and round-off", () => {
    const r = receipt([10000], { taxMinor: 500, serviceMinor: 500, tipMinor: 1000, discountMinor: 2000, roundOffMinor: -50, totalMinor: 9950 });
    expect(receiptDiff(r)).toBe(0);
  });
});

describe("itemized allocation (R34, R35)", () => {
  const order = ["A", "B", "C"];
  const items = [
    { amountMinor: 40000, assignees: ["A", "B"] }, // Pizza
    { amountMinor: 10000, assignees: ["A"] }, // Coke
    { amountMinor: 30000, assignees: ["C"] }, // Pasta
  ];
  it("AC-18: tax ₹40, printed ₹840 → owed A 31500, B 21000, C 31500", () => {
    const r = allocateItemized(items, 84000, order);
    expect(r.ok && r.itemShares).toEqual({ A: 30000, B: 20000, C: 30000 });
    expect(r.ok && r.owed).toEqual({ A: 31500, B: 21000, C: 31500 });
  });
  it("AC-18: printed ₹845 → remainder 4500 as [1688, 1125, 1687], owed sums to 84500, badge shown", () => {
    const r = allocateItemized(items, 84500, order);
    expect(r.ok && r.remainderShares).toEqual({ A: 1688, B: 1125, C: 1687 });
    expect(r.ok && r.owed).toEqual({ A: 31688, B: 21125, C: 31687 });
    const data = receipt([40000, 10000, 30000], { taxMinor: 4000, totalMinor: 84500 });
    expect(receiptDiff(data)).toBe(500);
    expect(isMismatch(receiptDiff(data))).toBe(true);
  });
  it("AC-18: a ₹100 item shared by 3 → [3334, 3333, 3333]", () => {
    const r = allocateItemized([{ amountMinor: 10000, assignees: ["C", "B", "A"] }], 10000, order);
    expect(r.ok && r.owed).toEqual({ A: 3334, B: 3333, C: 3333 });
  });
  it("AC-18: a negative remainder (discount > tax) still sums to the printed total", () => {
    const r = allocateItemized([{ amountMinor: 10000, assignees: ["A"] }, { amountMinor: 10001, assignees: ["B", "C"] }], 17000, order);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.remainderMinor).toBe(-3001);
      expect(Object.values(r.owed).reduce((a, b) => a + b, 0)).toBe(17000);
      expect(Object.values(r.owed).every((v) => v >= 0)).toBe(true);
    }
  });
  it("blocks unassigned items and empty receipts", () => {
    expect(allocateItemized([{ amountMinor: 100, assignees: [] }], 100, order)).toEqual({ ok: false, error: "UNASSIGNED_ITEM", itemIndex: 0 });
    expect(allocateItemized([], 100, order)).toEqual({ ok: false, error: "NO_ITEMS" });
    expect(allocateItemized([{ amountMinor: 0, assignees: ["A"] }], 100, order)).toEqual({ ok: false, error: "NO_ITEMS" });
  });
});

describe("model output parsing and extraction (R31, R32)", () => {
  const valid = {
    merchant: "Cafe",
    date: "2026-10-12",
    currency: "INR",
    items: [{ name: "Dosa", quantity: 1, amount: 12.5 }],
    tax: 0,
    service_charge: 0,
    tip: 0,
    discount: 0,
    round_off: 0,
    total: 12.5,
  };
  it("AC-19: converts amount 12.5 to 1250 paise", () => {
    expect(parseModelReceipt(valid, "INR")?.items[0].amountMinor).toBe(1250);
    expect(parseModelReceipt(JSON.stringify(valid), "INR")?.totalMinor).toBe(1250);
  });
  it("AC-19: rejects a missing items field or a negative item amount", () => {
    const noItems: Record<string, unknown> = { ...valid };
    delete noItems.items;
    expect(parseModelReceipt(noItems, "INR")).toBeNull();
    expect(parseModelReceipt({ ...valid, items: [{ name: "X", quantity: 1, amount: -1 }] }, "INR")).toBeNull();
    expect(parseModelReceipt("not json", "INR")).toBeNull();
  });
  it("treats null extras as 0 and bad dates/currencies as null", () => {
    const r = parseModelReceipt({ ...valid, tax: null, tip: undefined, date: "12/10/2026", currency: "rupees" }, "INR");
    expect(r?.taxMinor).toBe(0);
    expect(r?.tipMinor).toBe(0);
    expect(r?.date).toBeNull();
    expect(r?.currency).toBeNull();
  });
  it("AC-19: a timed-out model call yields EXTRACT_FAILED without throwing", async () => {
    const never = () => new Promise<string>(() => undefined);
    const r = await extractReceipt({ base64: "", mimeType: "image/jpeg" }, never, { timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, error: "EXTRACT_FAILED", reason: "timeout" });
  });
  it("model errors and invalid output also yield EXTRACT_FAILED", async () => {
    const boom = async () => {
      throw new Error("500");
    };
    expect(await extractReceipt({ base64: "", mimeType: "image/jpeg" }, boom)).toMatchObject({ ok: false, reason: "model_error" });
    expect(await extractReceipt({ base64: "", mimeType: "image/jpeg" }, async () => "{}")).toMatchObject({ ok: false, reason: "invalid_output" });
    expect(await extractReceipt({ base64: "", mimeType: "image/jpeg" }, async () => JSON.stringify(valid))).toMatchObject({ ok: true });
  });
});

describe("eval metrics (R37)", () => {
  it("AC-23: 4 ground-truth items, 3 predicted, 2 matching → P 0.667, R 0.5, F1 0.571", () => {
    const truth = receipt([], {
      items: [
        { name: "Paneer Tikka", quantity: 1, amountMinor: 28000 },
        { name: "Butter Naan", quantity: 2, amountMinor: 12000 },
        { name: "Dal Makhani", quantity: 1, amountMinor: 24000 },
        { name: "Lassi", quantity: 1, amountMinor: 9000 },
      ],
      totalMinor: 73000,
    });
    const predicted = receipt([], {
      items: [
        { name: "paneer tikka.", quantity: 1, amountMinor: 28000 },
        { name: "Butter Nan", quantity: 2, amountMinor: 12050 },
        { name: "Gulab Jamun", quantity: 1, amountMinor: 9000 },
      ],
      totalMinor: 73000,
    });
    const s = scoreEval([{ id: "r1", predicted, truth, latencyMs: 2000 }]);
    expect(s.precision).toBe(0.667);
    expect(s.recall).toBe(0.5);
    expect(s.f1).toBe(0.571);
    expect(s.totalAccuracy).toBe(1);
    expect(s.meanLatencySec).toBe(2);
  });
  it("AC-23: 'Paneer Tikka' vs 'paneer tikka.' with equal amounts is a match", () => {
    expect(nameSimilarity("Paneer Tikka", "paneer tikka.")).toBe(1);
    expect(matchItems([{ name: "paneer tikka.", amountMinor: 100 }], [{ name: "Paneer Tikka", amountMinor: 100 }]).matched).toBe(1);
  });
  it("matching is one-to-one and requires amounts within ₹1", () => {
    const m = matchItems(
      [
        { name: "Tea", amountMinor: 2000 },
        { name: "Tea", amountMinor: 2000 },
      ],
      [{ name: "Tea", amountMinor: 2000 }],
    );
    expect(m.matched).toBe(1);
    expect(matchItems([{ name: "Tea", amountMinor: 2101 }], [{ name: "Tea", amountMinor: 2000 }]).matched).toBe(0);
  });
  it("a failed extraction counts as no predictions", () => {
    const truth = receipt([1000], { totalMinor: 1000 });
    const s = scoreEval([{ id: "x", predicted: null, truth, latencyMs: 25000 }]);
    expect(s).toMatchObject({ precision: 0, recall: 0, f1: 0, totalAccuracy: 0, reconciliationRate: 0 });
    expect(s.perReceipt[0].error).toBe(true);
  });
});
