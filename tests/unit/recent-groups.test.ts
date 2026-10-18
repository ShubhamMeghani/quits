import { describe, expect, it } from "vitest";
import {
  formatLastOpened,
  loadRecent,
  markUnavailable,
  parseRecent,
  RECENT_CAP,
  RECENT_KEY,
  recordVisit,
  removeRecent,
  saveRecent,
  serializeRecent,
  tokenFromPath,
  type RecentGroup,
  type StorageLike,
} from "@/lib/recent-groups";
import { TOKEN_RE } from "@/server/token";

// AC-56 (unit part), R5 v1.3 / D-36: the per-device "Your groups" list.

const tok = (n: number) => `tok${String(n).padStart(4, "0")}_ABCDEFGHIJKLMNOPQ`; // 24 chars
const T0 = Date.UTC(2026, 9, 18, 6, 0); // 2026-10-18 11:30 IST

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)) };
}

describe("AC-56: Your groups list (lib/recent-groups.ts)", () => {
  it("adds a new group at the top with name, member, time and demo flag", () => {
    let list: RecentGroup[] = [];
    list = recordVisit(list, { token: tok(1), name: "Flat 302", memberName: "Aarav", demo: false }, T0);
    list = recordVisit(list, { token: tok(2), name: "Goa trip", memberName: null, demo: true }, T0 + 1000);
    expect(list.map((g) => g.token)).toEqual([tok(2), tok(1)]);
    expect(list[1]).toEqual({ token: tok(1), name: "Flat 302", memberName: "Aarav", lastOpened: T0, demo: false, unavailable: false });
    expect(list[0]).toMatchObject({ name: "Goa trip", memberName: null, demo: true });
  });

  it("a revisit updates the name, member, demo flag and time and moves the group to the top (no duplicates)", () => {
    let list = recordVisit([], { token: tok(1), name: "Flat", memberName: "Aarav", demo: false }, T0);
    list = recordVisit(list, { token: tok(2), name: "Goa", demo: false }, T0 + 1);
    list = recordVisit(list, { token: tok(1), name: "Flat 302 (renamed)", memberName: "Priya", demo: true }, T0 + 2);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ token: tok(1), name: "Flat 302 (renamed)", memberName: "Priya", lastOpened: T0 + 2, demo: true, unavailable: false });
  });

  it("memberName: undefined keeps the stored member, null clears it", () => {
    let list = recordVisit([], { token: tok(1), name: "Flat", memberName: "Aarav", demo: false }, T0);
    list = recordVisit(list, { token: tok(1), name: "Flat", demo: false }, T0 + 1);
    expect(list[0].memberName).toBe("Aarav");
    list = recordVisit(list, { token: tok(1), name: "Flat", memberName: null, demo: false }, T0 + 2);
    expect(list[0].memberName).toBeNull();
  });

  it("is ordered newest first, even if storage was written out of order", () => {
    const raw = JSON.stringify([
      { token: tok(1), name: "Old", memberName: null, lastOpened: T0, demo: false },
      { token: tok(2), name: "Newest", memberName: null, lastOpened: T0 + 5000, demo: false },
      { token: tok(3), name: "Middle", memberName: null, lastOpened: T0 + 100, demo: false },
    ]);
    expect(parseRecent(raw).map((g) => g.name)).toEqual(["Newest", "Middle", "Old"]);
  });

  it("remove drops only that group, from this list only", () => {
    let list: RecentGroup[] = [];
    for (let i = 1; i <= 3; i++) list = recordVisit(list, { token: tok(i), name: `G${i}`, demo: false }, T0 + i);
    const after = removeRecent(list, tok(2));
    expect(after.map((g) => g.token)).toEqual([tok(3), tok(1)]);
    expect(removeRecent(after, "not-in-list")).toEqual(after);
    expect(list).toHaveLength(3); // the input is not mutated
  });

  it(`caps the list at ${RECENT_CAP}, dropping the oldest`, () => {
    let list: RecentGroup[] = [];
    for (let i = 1; i <= 25; i++) list = recordVisit(list, { token: tok(i), name: `G${i}`, demo: false }, T0 + i);
    expect(RECENT_CAP).toBe(20);
    expect(list).toHaveLength(20);
    expect(list[0].token).toBe(tok(25));
    expect(list[19].token).toBe(tok(6));
    expect(list.some((g) => g.token === tok(5))).toBe(false);
    // Revisiting a group that fell off brings it back at the top.
    list = recordVisit(list, { token: tok(1), name: "G1", demo: false }, T0 + 100);
    expect(list[0].token).toBe(tok(1));
    expect(list).toHaveLength(20);
  });

  it("corrupt storage gives an empty list without throwing", () => {
    for (const raw of [null, undefined, "", "not json", "{", "42", '"text"', "null", "{}", '{"token":"x"}']) {
      expect(parseRecent(raw)).toEqual([]);
    }
  });

  it("wrongly shaped entries are dropped and valid ones kept; values are cleaned", () => {
    const raw = JSON.stringify([
      null,
      7,
      { token: "short", name: "Bad token", lastOpened: T0 },
      { token: "../../evil/path/aaaaaaaaaaaaaaaaaaaa", name: "Path", lastOpened: T0 },
      { token: tok(1), name: "   ", lastOpened: T0 },
      { token: tok(2), name: "No time" },
      { token: tok(3), name: "NaN time", lastOpened: "yesterday" },
      { token: tok(4), name: "  Good  ", memberName: 5, lastOpened: T0, demo: "yes", unavailable: 1 },
      { token: tok(5), name: "x".repeat(200), memberName: "y".repeat(80), lastOpened: T0 - 1, demo: true },
      { token: tok(4), name: "Duplicate, older", lastOpened: T0 - 10 },
    ]);
    const list = parseRecent(raw);
    expect(list.map((g) => g.token)).toEqual([tok(4), tok(5)]);
    expect(list[0]).toEqual({ token: tok(4), name: "Good", memberName: null, lastOpened: T0, demo: false, unavailable: false });
    expect(list[1].name).toHaveLength(60);
    expect(list[1].memberName).toHaveLength(30);
  });

  it("reads the pre-v1.3 shape { token, name, openedAt } so existing lists carry over", () => {
    const old = JSON.stringify([{ token: tok(1), name: "Flat 302", openedAt: T0 }]);
    expect(parseRecent(old)).toEqual([{ token: tok(1), name: "Flat 302", memberName: null, lastOpened: T0, demo: false, unavailable: false }]);
  });

  it("marks a listed group unavailable after a 404, clears it on the next successful visit, and never adds unlisted tokens", () => {
    let list = recordVisit([], { token: tok(1), name: "Old demo", demo: true }, T0);
    list = markUnavailable(list, tok(1));
    expect(list[0].unavailable).toBe(true);
    expect(markUnavailable(list, tok(9))).toEqual(list);
    list = recordVisit(list, { token: tok(1), name: "Old demo", demo: true }, T0 + 1);
    expect(list[0].unavailable).toBe(false);
  });

  it("load/save round-trip through storage under the quits:recent key", () => {
    const s = memoryStorage();
    const list = recordVisit([], { token: tok(1), name: "Flat", memberName: "Aarav", demo: false }, T0);
    expect(saveRecent(s, list)).toBe(true);
    expect(Object.keys(s.data)).toEqual([RECENT_KEY]);
    expect(RECENT_KEY).toBe("quits:recent");
    expect(loadRecent(s)).toEqual(list);
    expect(serializeRecent(list)).toBe(s.data[RECENT_KEY]);
    expect(loadRecent(memoryStorage({ [RECENT_KEY]: "garbage" }))).toEqual([]);
  });

  it("blocked storage (throws on read or write, or is missing) gives an empty list and never throws", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadRecent(blocked)).toEqual([]);
    expect(loadRecent(null)).toEqual([]);
    expect(loadRecent(undefined)).toEqual([]);
    expect(saveRecent(blocked, [])).toBe(false);
    expect(saveRecent(null, [])).toBe(false);
  });

  it("uses the same token format as the server, and reads the token from a group path", () => {
    expect(TOKEN_RE.source).toBe("^[A-Za-z0-9_-]{22,64}$");
    expect(tokenFromPath(`/g/${tok(1)}`)).toBe(tok(1));
    expect(tokenFromPath(`/g/${tok(1)}/settle`)).toBe(tok(1));
    expect(tokenFromPath("/g/doesnotexist")).toBeNull();
    expect(tokenFromPath("/about")).toBeNull();
  });

  it("formats the last-opened time (IST)", () => {
    const tz = "Asia/Kolkata";
    expect(formatLastOpened(T0 - 2 * 3_600_000, T0, tz)).toBe("Opened today, 09:30");
    expect(formatLastOpened(T0 - 24 * 3_600_000, T0, tz)).toBe("Opened yesterday");
    expect(formatLastOpened(Date.UTC(2026, 9, 3, 6), T0, tz)).toBe("Opened 3 Oct");
    expect(formatLastOpened(Date.UTC(2025, 11, 31, 6), T0, tz)).toBe("Opened 31 Dec 2025");
  });
});
