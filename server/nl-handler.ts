// Type-to-add parse route logic (R61, R64, R65). Dependencies are injected so the route can be
// tested with a mocked Gemini; the real wiring is in app/api/g/[token]/expenses/parse/route.ts.
// Nothing here writes to the database except the rate-limit counters (via bumpLimits).
import { z } from "zod";
import { NL_JSON_SCHEMA, NL_MAX_CHARS, NL_PROMPT, nlUserText, parseNlModel, resolveNl, type NlResult } from "@/lib/nlparse";

export type ParseDeps = {
  findGroup(token: string): Promise<{ id: string; baseCurrency: string } | null>;
  loadMembers(groupId: string): Promise<{ id: string; name: string; archived: boolean }[]>;
  /** Counts the call; false when the group or the app is over today's limit. */
  bumpLimits(groupId: string): Promise<boolean>;
  callModel(req: { prompt: string; text: string; jsonSchema: unknown; signal: AbortSignal }): Promise<string>;
  today(): string;
  timeoutMs?: number;
};

export const NL_FAILED = "Couldn't understand that — fill in the form";

const bodySchema = z.object({
  text: z.string().trim().min(1, "Type what you paid for").max(NL_MAX_CHARS, `Keep it under ${NL_MAX_CHARS} characters`),
  me: z.uuid().nullish(),
});

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createParseHandler(deps: ParseDeps) {
  return async function handle(request: Request, token: string): Promise<Response> {
    const group = await deps.findGroup(token);
    if (!group) return json({ error: "Group not found" }, 404);

    const raw = await request.json().catch(() => null);
    const body = bodySchema.safeParse(raw);
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? "Invalid request" }, 400);

    const members = (await deps.loadMembers(group.id)).filter((m) => !m.archived);
    const meId = body.data.me ?? null;
    if (meId && !members.some((m) => m.id === meId)) return json({ error: "Not found" }, 404);

    if (!(await deps.bumpLimits(group.id))) return json({ error: "Daily limit reached — fill in the form" }, 429);

    const today = deps.today();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, deps.timeoutMs ?? 15_000);
    });
    const request_ = {
      prompt: NL_PROMPT,
      text: nlUserText(body.data.text, { memberNames: members.map((m) => m.name), baseCurrency: group.baseCurrency, today }),
      jsonSchema: NL_JSON_SCHEMA,
      signal: controller.signal,
    };
    // One retry on a transient model error, still inside the single 15 s deadline (R64).
    const attempt = async (): Promise<{ text: string }> => {
      try {
        return { text: await deps.callModel(request_) };
      } catch (e) {
        if (controller.signal.aborted) throw e;
        return { text: await deps.callModel(request_) };
      }
    };
    try {
      const out = await Promise.race([attempt(), timeout]);
      if (out === "timeout") return json({ error: NL_FAILED, reason: "timeout" }, 502);
      const model = parseNlModel(out.text);
      if (!model) return json({ error: NL_FAILED, reason: "invalid_output" }, 502);
      const result: NlResult = resolveNl(model, { members: members.map((m) => ({ id: m.id, name: m.name })), meId, baseCurrency: group.baseCurrency, today });
      return json(result, 200);
    } catch {
      return json({ error: NL_FAILED, reason: "model_error" }, 502);
    } finally {
      clearTimeout(timer);
    }
  };
}
