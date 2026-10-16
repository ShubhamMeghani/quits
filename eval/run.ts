// Receipt-extraction evaluation (R37). Run: npm run eval [-- --dir eval/receipts --out eval]
//                                          npm run eval -- --report (rebuilds REPORT.md from the saved results; no model calls)
// Each `{id}.jpg|png|webp` in --dir needs a ground-truth `{id}.json` in the SPEC §4.3 schema.
// Uses the app's compression rules, prompt, JSON schema, model and parser; writes
// `{out}/results.json` (latest run) and `{out}/REPORT.md` (latest run, then earlier runs kept exactly
// as run from REPORT-run1.md). Since run 2, every receipt's predicted values are saved (D-32).
// The env (GEMINI_API_KEY, GEMINI_MODEL) is loaded by `node --env-file-if-exists=.env.local`
// (package.json); no key is ever printed.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { exponent } from "@/lib/currency";
import { minorToMajorString } from "@/lib/money";
import { extractReceipt, matchItems, parseModelReceipt, receiptDiff, scoreEval, type EvalCase, type EvalReceiptRow, type EvalSummary, type ReceiptData } from "@/lib/receipt";

const MAX_BYTES = 1_000_000;
const QUALITIES = [85, 75, 65, 55, 50];

/** What changed since run 1, labelled as for the NL eval (results.json and REPORT.md). */
const RUN = {
  run: 2,
  evalSetupFixes: ["D-32: every receipt's predicted values are saved (fields, items, diff, unmatched items, failure reason), so a miss can be explained from the file."],
  codeFixes: [] as string[],
  note: "Same images, ground truth, prompt, schema, model and scorer as run 1; no app code changed. The difference from run 1 is run-to-run variation of the model.",
};

/** Same rules as app/_lib/compress.ts: longest edge ≤ 2000 px, quality 0.85 → 0.5, then shrink. */
async function compress(file: string): Promise<Buffer> {
  const meta = await sharp(file).rotate().metadata();
  let edge = Math.min(2000, Math.max(meta.width ?? 2000, meta.height ?? 2000));
  while (edge >= 500) {
    for (const quality of QUALITIES) {
      const out = await sharp(file).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
    edge = Math.floor(edge * 0.8);
  }
  throw new Error(`${path.basename(file)}: cannot compress under 1 MB`);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

type Item = { name: string; quantity: number; amount: number };
type Predicted = {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  items: Item[];
  itemsSum: number;
  tax: number;
  service_charge: number;
  tip: number;
  discount: number;
  round_off: number;
  total: number;
  diff: number;
};
type SavedRow = EvalReceiptRow & { reason?: string; predicted?: Predicted; extraItems?: Item[]; missedItems?: Item[] };
type SavedRun = Omit<EvalSummary, "perReceipt"> &
  Partial<typeof RUN> & { status: string; dataset: string; model: string; runAt: string; perReceipt: SavedRow[] };

/** Major units for the saved file, in the receipt's own currency. */
function major(r: ReceiptData) {
  const e = exponent(r.currency ?? "INR");
  const m = (v: number) => Number(minorToMajorString(v, e));
  const item = (i: ReceiptData["items"][number]): Item => ({ name: i.name, quantity: i.quantity, amount: m(i.amountMinor) });
  return { m, item };
}

function describe(predicted: ReceiptData, truth: ReceiptData): Pick<SavedRow, "predicted" | "extraItems" | "missedItems"> {
  const { m, item } = major(predicted);
  const { pairs } = matchItems(predicted.items, truth.items);
  const usedP = new Set(pairs.map(([p]) => p));
  const usedT = new Set(pairs.map(([, t]) => t));
  return {
    predicted: {
      merchant: predicted.merchant,
      date: predicted.date,
      currency: predicted.currency,
      items: predicted.items.map(item),
      itemsSum: m(predicted.items.reduce((a, i) => a + i.amountMinor, 0)),
      tax: m(predicted.taxMinor),
      service_charge: m(predicted.serviceMinor),
      tip: m(predicted.tipMinor),
      discount: m(predicted.discountMinor),
      round_off: m(predicted.roundOffMinor),
      total: m(predicted.totalMinor),
      diff: m(receiptDiff(predicted)),
    },
    extraItems: predicted.items.filter((_, i) => !usedP.has(i)).map(item),
    missedItems: truth.items.filter((_, i) => !usedT.has(i)).map(major(truth).item),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** REPORT.md from saved results only: the main run, then earlier runs verbatim. */
function writeReport(out: string, results: SavedRun, truths: Map<string, ReceiptData>) {
  const small = `n = ${results.n}, small sample: one receipt moves a per-receipt rate by ${pct(1 / Math.max(1, results.n))}.`;
  const kept = fs.existsSync(path.join(out, "REPORT-run1.md")) ? fs.readFileSync(path.join(out, "REPORT-run1.md"), "utf8").trimEnd() : "";
  const fmt = (v: number) => v.toFixed(2);
  const fields = ["tax", "service_charge", "tip", "discount", "round_off", "total"] as const;
  const detail = results.perReceipt.flatMap((r) => {
    const t = truths.get(r.id);
    if (!r.predicted || !t) return [`### ${r.id}`, "", `No answer (${r.reason ?? "error"}, ${r.latencySec} s).`, ""];
    const { m } = major(t);
    const truthOf: Record<(typeof fields)[number], number> = {
      tax: m(t.taxMinor),
      service_charge: m(t.serviceMinor),
      tip: m(t.tipMinor),
      discount: m(t.discountMinor),
      round_off: m(t.roundOffMinor),
      total: m(t.totalMinor),
    };
    const p = r.predicted;
    return [
      `### ${r.id}${r.reconciled ? "" : " (not reconciled)"}`,
      "",
      `Items: ${r.predictedItems} predicted, ${r.truthItems} true, ${r.matched} matched · Σitems ${fmt(p.itemsSum)} (true ${fmt(m(t.items.reduce((a, i) => a + i.amountMinor, 0)))}) · diff ${fmt(p.diff)}`,
      "",
      "| Field | Predicted | True |",
      "|---|---|---|",
      ...fields.map((f) => `| ${f} | ${fmt(p[f])}${p[f] === truthOf[f] ? "" : " ✗"} | ${fmt(truthOf[f])} |`),
      "",
      ...(r.extraItems?.length ? [`Extra predicted items: ${r.extraItems.map((i) => `${i.name} ×${i.quantity} = ${fmt(i.amount)}`).join("; ")}`, ""] : []),
      ...(r.missedItems?.length ? [`Missed true items: ${r.missedItems.map((i) => `${i.name} ×${i.quantity} = ${fmt(i.amount)}`).join("; ")}`, ""] : []),
    ];
  });
  const report = [
    `# Receipt extraction eval — ${results.dataset}`,
    "",
    `## Run ${results.run ?? RUN.run} (main result)`,
    "",
    `- Model: \`${results.model}\` · run ${results.runAt}`,
    `- Receipts: ${results.n} (${small})`,
    "",
    "**Eval-setup fixes since run 1:**",
    "",
    ...(results.evalSetupFixes ?? []).map((x) => `- ${x}`),
    "",
    `**Code fixes:** ${results.codeFixes?.length ? results.codeFixes.join(" ") : "none."} ${results.note ?? ""}`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Item precision | ${pct(results.precision)} |`,
    `| Item recall | ${pct(results.recall)} |`,
    `| Item F1 | ${pct(results.f1)} |`,
    `| Total accuracy (±₹1) | ${pct(results.totalAccuracy)} |`,
    `| Reconciliation rate (\\|diff\\| ≤ ₹1) | ${pct(results.reconciliationRate)} |`,
    `| Mean latency | ${results.meanLatencySec.toFixed(2)} s |`,
    "",
    "| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |",
    "|---|---|---|---|---|---|---|",
    ...results.perReceipt.map(
      (r) => `| ${r.id}${r.error ? " (failed)" : ""} | ${r.predictedItems} | ${r.truthItems} | ${r.matched} | ${r.totalCorrect ? "yes" : "no"} | ${r.reconciled ? "yes" : "no"} | ${r.latencySec} |`,
    ),
    "",
    "Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).",
    "",
    "### Saved predictions (D-32)",
    "",
    "✗ marks a field that differs from the ground truth. diff = total − (Σitems + tax + service + tip − discount + round-off).",
    "",
    ...detail,
    ...(kept ? ["## Run 1 (kept exactly as run; `results-run1.json`)", "", "_Run 1's report, verbatim. It saved no predicted values, so its misses cannot be explained from the file._", "", kept, ""] : []),
  ].join("\n");
  fs.writeFileSync(path.join(out, "REPORT.md"), report);
}

function loadTruths(dir: string, images: string[]): Map<string, ReceiptData> {
  const truths = new Map<string, ReceiptData>();
  for (const img of images) {
    const id = img.replace(/\.[^.]+$/, "");
    const gtPath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(gtPath)) {
      console.error(`eval: missing ground truth ${gtPath}`);
      process.exit(1);
    }
    const truth = parseModelReceipt(fs.readFileSync(gtPath, "utf8"), "INR");
    if (!truth) {
      console.error(`eval: ${gtPath} does not match the §4.3 schema`);
      process.exit(1);
    }
    truths.set(id, truth);
  }
  return truths;
}

async function main() {
  const dir = arg("dir", "eval/receipts");
  const out = arg("out", "eval");
  const label = arg("label", dir.includes("synthetic") ? "synthetic smoke test" : "real receipts");
  const images = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
  if (images.length === 0) {
    console.error(`eval: no images in ${dir}. Add {id}.jpg + {id}.json pairs (see eval/README.md).`);
    process.exit(1);
  }
  const truths = loadTruths(dir, images);
  if (process.argv.includes("--report")) {
    writeReport(out, JSON.parse(fs.readFileSync(path.join(out, "results.json"), "utf8")) as SavedRun, truths);
    console.log("report: REPORT.md rebuilt from the saved results. No model calls were made.");
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("eval: GEMINI_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }
  const { geminiModel, geminiReceiptClient } = await import("@/server/gemini");

  const cases: EvalCase[] = [];
  const details: Record<string, Partial<SavedRow>> = {};
  for (const img of images) {
    const id = img.replace(/\.[^.]+$/, "");
    const truth = truths.get(id)!;
    const jpeg = await compress(path.join(dir, img));
    const r = await extractReceipt({ base64: jpeg.toString("base64"), mimeType: "image/jpeg" }, geminiReceiptClient, { fallbackCurrency: "INR" });
    cases.push({ id, truth, predicted: r.ok ? r.data : null, latencyMs: r.latencyMs });
    details[id] = r.ok ? describe(r.data, truth) : { reason: r.reason };
    console.log(`${id}: ${r.ok ? `${r.data.items.length} items, total ${r.data.totalMinor / 100}, diff ${receiptDiff(r.data) / 100}` : `FAILED (${r.reason})`} in ${(r.latencyMs / 1000).toFixed(1)} s`);
  }

  const summary = scoreEval(cases);
  const results: SavedRun = {
    status: "ok",
    // The run labels describe the real set only; the synthetic smoke test has no earlier runs.
    ...(dir.includes("synthetic") ? {} : RUN),
    dataset: label,
    model: geminiModel(),
    runAt: new Date().toISOString(),
    ...summary,
    perReceipt: summary.perReceipt.map((r) => ({ ...r, ...details[r.id] })),
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");
  writeReport(out, results, truths);
  console.log(`\nrun ${RUN.run}: P ${pct(summary.precision)} · R ${pct(summary.recall)} · F1 ${pct(summary.f1)} · total ${pct(summary.totalAccuracy)} · reconciled ${pct(summary.reconciliationRate)}`);
  console.log(`wrote ${path.join(out, "results.json")} and ${path.join(out, "REPORT.md")}`);
}

main().catch((e) => {
  console.error("eval failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
