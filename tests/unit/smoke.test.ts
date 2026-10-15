import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/money";

describe("smoke", () => {
  it("runs vitest with the @ alias", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });
});
