import { describe, expect, it } from "vitest";
import {
  allocate,
  decimalToMinor,
  divRoundHalfUp,
  formatMoney,
  minorToMajorString,
  parseMajorInput,
} from "@/lib/money";

describe("allocate (largest remainder, R13)", () => {
  it("AC-1: ₹100.00 among 3 → [3334, 3333, 3333]", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });
  it("AC-1: 100 paise among 7 → [15, 15, 14, 14, 14, 14, 14]", () => {
    expect(allocate(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });
  it("gives leftovers to the largest remainders, ties to the earlier entry", () => {
    expect(allocate(999, [5000, 2500, 2500])).toEqual([499, 250, 250]);
    expect(allocate(1001, [2, 1, 1])).toEqual([501, 250, 250]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
  });
  it("never gives leftovers to zero weights and always sums exactly", () => {
    expect(allocate(10, [0, 1, 0, 2])).toEqual([0, 3, 0, 7]);
    expect(allocate(7, [3, 0, 3])).toEqual([4, 0, 3]);
  });
  it("allocates a negative total as |total| and negates", () => {
    expect(allocate(-10000, [1, 1, 1])).toEqual([-3334, -3333, -3333]);
  });
  it("rejects bad input", () => {
    expect(() => allocate(10, [])).toThrow();
    expect(() => allocate(10, [0, 0])).toThrow();
    expect(() => allocate(10, [-1, 2])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
  });
});

describe("decimal helpers", () => {
  it("rounds half-up (half away from zero)", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
  });
  it("converts major decimals to minor units", () => {
    expect(decimalToMinor(12.5, 2)).toBe(1250);
    expect(decimalToMinor("0.005", 2)).toBe(1);
    expect(decimalToMinor("0.004", 2)).toBe(0);
    expect(decimalToMinor(1000, 0)).toBe(1000);
    expect(decimalToMinor(-1.25, 2)).toBe(-125);
    expect(decimalToMinor(0.1 + 0.2, 2)).toBe(30);
  });
  it("parses user input", () => {
    expect(parseMajorInput("1,240.50", 2)).toBe(124050);
    expect(parseMajorInput("₹ 99", 2)).toBe(9900);
    expect(parseMajorInput("12.345", 2)).toBeNull();
    expect(parseMajorInput("abc", 2)).toBeNull();
    expect(parseMajorInput("10.", 2)).toBe(1000);
  });
  it("formats minor units", () => {
    expect(minorToMajorString(45050, 2)).toBe("450.50");
    expect(minorToMajorString(5, 2)).toBe("0.05");
    expect(minorToMajorString(-5, 2)).toBe("-0.05");
    expect(minorToMajorString(1000, 0)).toBe("1000");
    expect(formatMoney(12345678, "INR", 2)).toBe("₹1,23,456.78");
  });
});
