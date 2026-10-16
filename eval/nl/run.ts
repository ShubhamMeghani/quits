// Type-to-add evaluation (SPEC R66). Run:  npm run eval:nl            (calls Gemini, writes results)
//                                          npm run eval:nl -- --check  (validates the files only)
// Each eval/nl/*.json holds one sentence, its group context and the ground truth (see README.md).
// Uses the app's prompt, schema, model and lib/nlparse post-processing; writes results.json and
// REPORT.md. The env (GEMINI_API_KEY, GEMINI_MODEL) is loaded by `node --env-file-if-exists`.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { exponent, isSupportedCurrency } from "@/lib/currency";
import { decimalToMinor, minorToMajorString } from "@/lib/money";
import {
  NL_JSON_SCHEMA,
  NL_MAX_CHARS,
  NL_PROMPT,
  nlUserText,
  parseNlModel,
  resolveNl,
  scoreNl,
  type NlEvalCase,
  type NlField,
  type NlGold,
} from "@/lib/nlparse";

const DIR = "eval/nl";
const FIELDS = ["description", "amount", "currency", "payer", "participants", "split", "category", "date"] as const;

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
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "results.json").sort();
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

function gold(c: EvalFile): NlGold {
  const e = c.expected;
  const exp = exponent(e.currency);
  const values =
    e.split_values &&
    Object.fromEntries(
      Object.entries(e.split_values).map(([name, v]) => [
        name,
        e.split_type === "exact" ? minorToMajorString(decimalToMinor(v, exp), exp) : e.split_type === "percent" ? String(Number(v.toFixed(2))) : String(v),
      ]),
    );
  return {
    amountMinor: e.amount === null ? null : decimalToMinor(e.amount, exp),
    payerId: e.payer,
    participantIds: e.participants,
    splitType: e.split_type,
    splitValues: values ?? null,
  };
}

async function main() {
  const cases = load();
  const by = (a: string) => cases.filter((c) => c.author === a).length;
  console.log(`${cases.length} sentences (${by("claude")} by Claude, ${by("human")} by the human; ${cases.filter((c) => c.ambiguous).length} ambiguous; ${cases.filter((c) => c.reviewed).length} reviewed)`);
  if (process.argv.includes("--check")) {
    console.log("check: all files are valid. No model calls were made.");
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("eval:nl: GEMINI_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }
  const { geminiModel, geminiTextJson } = await import("@/server/gemini");
  const scored: NlEvalCase[] = [];
  for (const c of cases) {
    // Member ids are the names themselves, so the gold can be written with names.
    const ctx = { members: c.members.map((n) => ({ id: n, name: n })), meId: c.me, baseCurrency: c.baseCurrency, today: c.today };
    const t0 = Date.now();
    let predicted = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const text = await geminiTextJson({
        prompt: NL_PROMPT,
        text: nlUserText(c.text, { memberNames: c.members, baseCurrency: c.baseCurrency, today: c.today }),
        jsonSchema: NL_JSON_SCHEMA,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const model = parseNlModel(text);
      predicted = model ? resolveNl(model, ctx) : null;
    } catch {
      predicted = null;
    }
    scored.push({ id: c.id, gold: gold(c), predicted, ambiguous: c.ambiguous, blank: c.blank as NlField[], latencyMs: Date.now() - t0 });
    console.log(`${c.id}: ${predicted ? "ok" : "FAILED"}`);
  }
  const s = scoreNl(scored);
  const results = { status: "ok", model: geminiModel(), runAt: new Date().toISOString(), authors: { claude: by("claude"), human: by("human") }, ...s };
  fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(results, null, 2) + "\n");
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  fs.writeFileSync(
    path.join(DIR, "REPORT.md"),
    [
      "# Type-to-add eval",
      "",
      `- Model: \`${results.model}\` · run ${results.runAt}`,
      `- Sentences: ${s.n} (${s.ambiguousN} ambiguous) · by Claude ${results.authors.claude}, by the human ${results.authors.human}`,
      "",
      "| Metric | Value |",
      "|---|---|",
      `| Amount accuracy | ${pct(s.amountAccuracy)} |`,
      `| Payer accuracy | ${pct(s.payerAccuracy)} |`,
      `| Participant-set accuracy | ${pct(s.participantsAccuracy)} |`,
      `| Split-type accuracy | ${pct(s.splitTypeAccuracy)} |`,
      `| Exact match | ${pct(s.exactMatchRate)} |`,
      `| Correct abstention (ambiguous) | ${pct(s.abstentionRate)} |`,
      `| Mean latency | ${s.meanLatencySec.toFixed(2)} s |`,
      "",
      "| Sentence | Amount | Payer | Participants | Split type | Exact | Abstained |",
      "|---|---|---|---|---|---|---|",
      ...s.perSentence.map((r) => `| ${r.id}${r.error ? " (failed)" : ""} | ${r.amount ? "✓" : "✗"} | ${r.payer ? "✓" : "✗"} | ${r.participants ? "✓" : "✗"} | ${r.splitType ? "✓" : "✗"} | ${r.exact ? "✓" : "✗"} | ${r.abstained === null ? "—" : r.abstained ? "✓" : "✗"} |`),
      "",
    ].join("\n"),
  );
  console.log(`amount ${pct(s.amountAccuracy)} · exact ${pct(s.exactMatchRate)} · abstention ${pct(s.abstentionRate)} → eval/nl/results.json, REPORT.md`);
}

main().catch((e) => {
  console.error("eval:nl failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
