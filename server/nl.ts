import "server-only";
import { todayIST } from "@/lib/currency";
import { findGroupByToken, loadMembers } from "@/server/context";
import { geminiTextJson } from "@/server/gemini";
import { rpc } from "@/server/groups";
import { createParseHandler } from "@/server/nl-handler";

const limit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * R65: a per-group type-to-add limit (NL_LIMIT_PER_GROUP, default 50/day) plus the app-wide daily
 * AI limit shared with receipt scans (the `scan:app` bucket, SCAN_LIMIT_PER_APP, default 300).
 */
export async function bumpNlLimits(groupId: string): Promise<boolean> {
  const day = todayIST();
  const [g, a] = await Promise.all([
    rpc<number>("bump_rate_limit", { p_bucket: `nl:group:${groupId}`, p_day: day }),
    rpc<number>("bump_rate_limit", { p_bucket: "scan:app", p_day: day }),
  ]);
  return g <= limit("NL_LIMIT_PER_GROUP", 50) && a <= limit("SCAN_LIMIT_PER_APP", 300);
}

export const parseExpenseText = createParseHandler({
  findGroup: async (token) => {
    const g = await findGroupByToken(token);
    return g ? { id: g.id, baseCurrency: g.baseCurrency } : null;
  },
  loadMembers: async (groupId) => (await loadMembers(groupId)).map((m) => ({ id: m.id, name: m.name, archived: m.archived })),
  bumpLimits: bumpNlLimits,
  callModel: async (req) => {
    try {
      return await geminiTextJson(req);
    } catch (e) {
      // Log the kind of failure only (no text, no keys).
      const err = e as { name?: string; status?: number };
      console.error(`type-to-add model error: ${err.name ?? "Error"}${err.status ? ` ${err.status}` : ""}`);
      throw e;
    }
  },
  today: todayIST,
});
