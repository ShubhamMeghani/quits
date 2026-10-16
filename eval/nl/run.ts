// Type-to-add evaluation (SPEC R66). Run:  npm run eval:nl            (calls Gemini, writes results)
//                                          npm run eval:nl -- --check  (validates the files only)
//                                          npm run eval:nl -- --report (rebuilds REPORT.md from the saved results; no model calls)
// Each eval/nl/{claude,human}-NN.json holds one sentence, its group context and the ground truth
// (see README.md). Since run 2, every sentence goes through the app's own parse handler
// (server/nl-handler.ts: same prompt, schema, model, 20 s deadline, one delayed retry on a model error,
// lib/nlparse post-processing), with ~2 s between calls. Writes results.json (latest run) and
// REPORT.md (latest run, then earlier runs kept exactly as run from REPORT-run2.md and REPORT-run1.md).
// The env (GEMINI_API_KEY, GEMINI_MODEL) is loaded by `node --env-file-if-exists`.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { exponent, isSupportedCurrency } from "@/lib/currency";
import { decimalToMinor, minorToMajorString } from "@/lib/money";
import { answeredSummary, NL_MAX_CHARS, scoreNl, type NlEvalCase, type NlEvalRow, type NlEvalSummary, type NlField, type NlGold, type NlResult } from "@/lib/nlparse";
import { createParseHandler } from "@/server/nl-handler";

const DIR = "eval/nl";
const PACE_MS = 2000;
const FIELDS = ["description", "amount", "currency", "payer", "participants", "split", "category", "date"] as const;

/** What changed since run 1, labelled as the user asked (results.json and REPORT.md). */
const RUN = {
  run: 3,
  evalSetupFixes: [
    "Q3 (D-30): every failure now records the reason with Gemini's real HTTP status (e.g. model_error 503), and every sentence its predicted values. Run 2's setup is otherwise unchanged: the app's own parse handler, ~2 s between calls.",
  ],
  codeFixes: [
    "Q2 (D-29): the type-to-add limit rises from 15 s to 20 s, and the single retry now waits about 1 s first. Prompted by the investigation of runs 1-2: all errors were HTTP 503 \"high demand\", some arriving after 12 s, which left the retry too little time.",
    "Q1 (D-28): the UI now says \"Couldn't read that — try again\" with a Try again button. This changes nothing the eval measures.",
    "Carried over from run 2: P3 (two names for one person in a split leave the split blank).",
  ],
  blindness: "Run 3 is NOT blind for P3 (from run 1) or for Q2 (chosen after seeing runs 1-2's failures). The prompt is unchanged since run 1 (P4 not applied); the thinking level stays at the model default (Q4 not applied).",
};

const fileSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(NL_MAX_CHARS),
  members: z.array(z.string().min(1)).min(2),
  me: z.string().min(1),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baseCurrency: z.string().refine(isSupportedCurrency),
  author: z.enum(["claude", "human"]),
  reviewed: z.boolean(),
  ambiguous: z.boolean(),
  blank: z.array(z.enum(FIELDS)),
  note: z.string().optional(),
  expected: z.object({
    amount: z.number().positive().nullable(),
    currency: z.string().refine(isSupportedCurrency),
    payer: z.string().nullable(),
    participants: z.array(z.string()).nullable(),
    split_type: z.enum(["equal", "exact", "percent", "shares"]),
    split_values: z.record(z.string(), z.number()).nullable(),
    category: z.string().nullable(),
    date: z.string().nullable(),
    description: z.string().nullable(),
  }),
});
type EvalFile = z.infer<typeof fileSchema>;

function load(): EvalFile[] {
  const files = fs.readdirSync(DIR).filter((f) => /^(claude|human)-\d+\.json$/.test(f)).sort();
  const out: EvalFile[] = [];
  const problems: string[] = [];
  for (const f of files) {
    const parsed = fileSchema.safeParse(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
    if (!parsed.success) {
      problems.push(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const c = parsed.data;
    const names = new Set(c.members);
    const check = (n: string | null, what: string) => n && !names.has(n) && problems.push(`${f}: ${what} "${n}" is not in members`);
    check(c.me, "me");
    check(c.expected.payer, "payer");
    c.expected.participants?.forEach((n) => check(n, "participant"));
    Object.keys(c.expected.split_values ?? {}).forEach((n) => check(n, "split value"));
    if (c.ambiguous && c.blank.length === 0) problems.push(`${f}: ambiguous but no "blank" fields`);
    out.push(c);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  return out;
}

/** The handler needs real UUIDs; members get stable ones by position. */
const uuidFor = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;

function gold(c: EvalFile, id: (name: string) => string): NlGold {
  const e = c.expected;
  const exp = exponent(e.currency);
  const values =
    e.split_values &&
    Object.fromEntries(
      Object.entries(e.split_values).map(([name, v]) => [
        id(name),
        e.split_type === "exact" ? minorToMajorString(decimalToMinor(v, exp), exp) : e.split_type === "percent" ? String(Number(v.toFixed(2))) : String(v),
      ]),
    );
  return {
    amountMinor: e.amount === null ? null : decimalToMinor(e.amount, exp),
    payerId: e.payer === null ? null : id(e.payer),
    participantIds: e.participants === null ? null : e.participants.map(id),
    splitType: e.split_type,
    splitValues: values ?? null,
    currency: e.currency,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type SavedRow = NlEvalRow & { status?: number; reason?: string; geminiStatus?: number; predicted?: Record<string, unknown> };
type SavedRun = Omit<NlEvalSummary, "perSentence"> &
  Partial<typeof RUN> & { status: string; model: string; runAt: string; authors: { claude: number; human: number }; perSentence: SavedRow[] };

const readRun = (file: string) => JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as SavedRun;

/** Each run's limit, as run (for the answer-rate table). */
const LIMITS: Record<number, string> = { 1: "15 s, no retry", 2: "15 s, one retry", 3: "20 s, one retry after ~1 s" };

/** D-31: answer rate and accuracy when answered, next to the overall figures, for every run (from the saved results). */
function answerRateSection(runs: { label: string; limit: string; r: SavedRun }[]): string[] {
  const rows = runs.map(({ r }) => ({ r, a: answeredSummary(r.perSentence) }));
  const both = (pick: (x: (typeof rows)[number]) => [number, number]) =>
    rows
      .map((x) => {
        const [overall, answered] = pick(x);
        return `${pct(overall)} / ${pct(answered)}`;
      })
      .join(" | ");
  return [
    "## Answer rate and accuracy when answered (all runs)",
    "",
    '"Answered" means the app returned a usable prefill within its limit. **Overall** counts a sentence with no answer as wrong on every field; **when answered** counts only the answered sentences. Computed from each run\'s saved results file; no run was repeated.',
    "",
    `| | ${runs.map((x) => x.label).join(" | ")} |`,
    `|---|${runs.map(() => "---|").join("")}`,
    `| Limit | ${runs.map((x) => x.limit).join(" | ")} |`,
    `| **Answer rate** | ${rows.map(({ a }) => `**${pct(a.answerRate)}** (${a.answered}/${a.n})`).join(" | ")} |`,
    `| Amount: overall / when answered | ${both(({ r, a }) => [r.amountAccuracy, a.amountAccuracy])} |`,
    `| Payer | ${both(({ r, a }) => [r.payerAccuracy, a.payerAccuracy])} |`,
    `| Participant set | ${both(({ r, a }) => [r.participantsAccuracy, a.participantsAccuracy])} |`,
    `| Split type | ${both(({ r, a }) => [r.splitTypeAccuracy, a.splitTypeAccuracy])} |`,
    `| **Exact match** | ${both(({ r, a }) => [r.exactMatchRate, a.exactMatchRate])} |`,
    `| Correct abstention (ambiguous) | ${rows.map(({ r, a }) => `${pct(r.abstentionRate)} / ${pct(a.abstentionRate)} (${a.ambiguousAnswered} of ${r.ambiguousN} answered)`).join(" | ")} |`,
    "",
  ];
}

/** REPORT.md from saved results only: the all-runs table, the main run, then earlier runs verbatim. */
function writeReport(results: SavedRun) {
  const run = results.run ?? RUN.run;
  const s = results;
  const show = (v: unknown) => (v === null || v === undefined ? "—" : Array.isArray(v) ? v.join(", ") || "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const kept = (n: number) => (fs.existsSync(path.join(DIR, `REPORT-run${n}.md`)) ? fs.readFileSync(path.join(DIR, `REPORT-run${n}.md`), "utf8").trimEnd() : "");
  const report = [
    "# Type-to-add eval",
    "",
    ...answerRateSection([
      { label: "Run 1", limit: LIMITS[1], r: readRun("results-run1.json") },
      { label: "Run 2", limit: LIMITS[2], r: readRun("results-run2.json") },
      { label: `Run ${run} (main)`, limit: LIMITS[run] ?? "", r: results },
    ]),
    `## Run ${run} (main result)`,
    "",
    `- Model: \`${results.model}\` · run ${results.runAt}`,
    `- Sentences: ${s.n} (${s.ambiguousN} ambiguous) · by Claude ${results.authors.claude}, by the human ${results.authors.human}`,
    "",
    "**Eval-setup fixes since run 1 (how the eval calls the app):**",
    "",
    ...(results.evalSetupFixes ?? []).map((x) => `- ${x}`),
    "",
    "**Code fixes found by the eval (the app changed):**",
    "",
    ...(results.codeFixes ?? []).map((x) => `- ${x}`),
    "",
    `**Blindness:** ${results.blindness}`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Amount accuracy | ${pct(s.amountAccuracy)} |`,
    `| Payer accuracy | ${pct(s.payerAccuracy)} |`,
    `| Participant-set accuracy | ${pct(s.participantsAccuracy)} |`,
    `| Split-type accuracy | ${pct(s.splitTypeAccuracy)} |`,
    `| Exact match (D-27) | ${pct(s.exactMatchRate)} |`,
    `| Correct abstention (ambiguous) | ${pct(s.abstentionRate)} |`,
    `| Mean latency | ${s.meanLatencySec.toFixed(2)} s |`,
    "",
    "| Sentence | Amount | Payer | Participants | Split type | Exact | Abstained | Predicted (amount · payer · participants · split) |",
    "|---|---|---|---|---|---|---|---|",
    ...results.perSentence.map((r) => {
      const p = r.predicted;
      const pred = p
        ? `${show(p.amount)} · ${show(p.payer)} · ${show(p.participants)} · ${show(p.splitType)}${p.splitValues ? ` ${show(p.splitValues)}` : ""}`
        : `no answer (${r.reason ?? r.status}${r.geminiStatus ? `, Gemini HTTP ${r.geminiStatus}` : ""}, ${r.latencySec} s)`;
      return `| ${r.id}${r.error ? " (failed)" : ""} | ${r.amount ? "✓" : "✗"} | ${r.payer ? "✓" : "✗"} | ${r.participants ? "✓" : "✗"} | ${r.splitType ? "✓" : "✗"} | ${r.exact ? "✓" : "✗"} | ${r.abstained === null ? "—" : r.abstained ? "✓" : "✗"} | ${pred.replace(/\|/g, "\\|")} |`;
    }),
    "",
    "## Run 2 (kept exactly as run; `results-run2.json`)",
    "",
    '_Run 2\'s report section, verbatim (it says "main result" because it was the main result then)._',
    "",
    kept(2),
    "",
    "## Run 1 (kept exactly as run; `results-run1.json`)",
    "",
    kept(1),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(DIR, "REPORT.md"), report);
}

async function main() {
  const cases = load();
  const by = (a: string) => cases.filter((c) => c.author === a).length;
  console.log(`${cases.length} sentences (${by("claude")} by Claude, ${by("human")} by the human; ${cases.filter((c) => c.ambiguous).length} ambiguous; ${cases.filter((c) => c.reviewed).length} reviewed)`);
  if (process.argv.includes("--check")) {
    console.log("check: all files are valid. No model calls were made.");
    return;
  }
  if (process.argv.includes("--report")) {
    writeReport(readRun("results.json"));
    console.log("report: REPORT.md rebuilt from the saved results. No model calls were made.");
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("eval:nl: GEMINI_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }
  const { geminiModel, geminiTextJson } = await import("@/server/gemini");

  const scored: NlEvalCase[] = [];
  const details: Record<string, { status: number; reason?: string; geminiStatus?: number; predicted?: Record<string, unknown> }> = {};
  for (const [i, c] of cases.entries()) {
    if (i > 0) await sleep(PACE_MS);
    const members = c.members.map((name, k) => ({ id: uuidFor(k), name, archived: false }));
    const idOf = new Map(members.map((m) => [m.name, m.id]));
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const id = (name: string) => idOf.get(name)!;
    // P1: the app's own handler, so the eval measures exactly what the app does.
    const handle = createParseHandler({
      findGroup: async () => ({ id: "eval", baseCurrency: c.baseCurrency }),
      loadMembers: async () => members,
      bumpLimits: async () => true,
      callModel: geminiTextJson,
      today: () => c.today,
    });
    const t0 = Date.now();
    const res = await handle(
      new Request("http://eval.local/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: c.text, me: id(c.me) }) }),
      "eval",
    );
    const latencyMs = Date.now() - t0;
    const body = (await res.json().catch(() => ({}))) as Partial<NlResult> & { reason?: string; status?: number };
    const predicted = res.ok && body.prefill ? ({ prefill: body.prefill, flags: body.flags ?? [] } as NlResult) : null;
    scored.push({ id: c.id, gold: gold(c, id), predicted, ambiguous: c.ambiguous, blank: c.blank as NlField[], latencyMs, memberOrder: members.map((m) => m.id) });
    // P2: keep what was predicted, with names instead of ids.
    const p = predicted?.prefill;
    details[c.id] = {
      status: res.status,
      ...(body.reason ? { reason: body.reason } : {}),
      ...(body.status ? { geminiStatus: body.status } : {}),
      ...(p
        ? {
            predicted: {
              amount: p.amountMinor === null ? null : Number(minorToMajorString(p.amountMinor, exponent(p.currency))),
              currency: p.currency,
              payer: p.payerId === null ? null : nameOf.get(p.payerId),
              participants: p.participantIds.map((x) => nameOf.get(x)),
              splitType: p.splitType,
              splitValues: p.splitValues && Object.fromEntries(Object.entries(p.splitValues).map(([k, v]) => [nameOf.get(k), v])),
              category: p.category,
              date: p.date,
              flags: predicted!.flags.map((f) => `${f.field}:${f.reason}${f.value ? `(${f.value})` : ""}`),
            },
          }
        : {}),
    };
    console.log(`${c.id}: ${predicted ? "ok" : `FAILED (${res.status} ${body.reason ?? ""}${body.status ? ` gemini ${body.status}` : ""})`} in ${(latencyMs / 1000).toFixed(1)} s`);
  }

  const s = scoreNl(scored);
  const results = {
    status: "ok",
    ...RUN,
    model: geminiModel(),
    runAt: new Date().toISOString(),
    authors: { claude: by("claude"), human: by("human") },
    ...s,
    perSentence: s.perSentence.map((r) => ({ ...r, ...details[r.id] })),
  };
  fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(results, null, 2) + "\n");

  writeReport(results as SavedRun);
  console.log(`run ${RUN.run}: amount ${pct(s.amountAccuracy)} · exact ${pct(s.exactMatchRate)} · abstention ${pct(s.abstentionRate)} → eval/nl/results.json, REPORT.md`);
}

main().catch((e) => {
  console.error("eval:nl failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
