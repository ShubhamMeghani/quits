// Receipt-extraction evaluation (R37). Run: npm run eval [-- --dir eval/receipts --out eval]
// Each `{id}.jpg|png|webp` in --dir needs a ground-truth `{id}.json` in the SPEC §4.3 schema.
// Uses the app's compression rules, prompt, JSON schema, model and parser; writes
// `{out}/results.json` and `{out}/REPORT.md`. The env (GEMINI_API_KEY, GEMINI_MODEL) is loaded by
// `node --env-file-if-exists=.env.local` (package.json); no key is ever printed.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { extractReceipt, parseModelReceipt, scoreEval, type EvalCase } from "@/lib/receipt";
import { geminiModel, geminiReceiptClient } from "@/server/gemini";

const MAX_BYTES = 1_000_000;
const QUALITIES = [85, 75, 65, 55, 50];

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

async function main() {
  const dir = arg("dir", "eval/receipts");
  const out = arg("out", "eval");
  const label = arg("label", dir.includes("synthetic") ? "synthetic smoke test" : "real receipts");
  if (!process.env.GEMINI_API_KEY) {
    console.error("eval: GEMINI_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }
  const images = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();
  if (images.length === 0) {
    console.error(`eval: no images in ${dir}. Add {id}.jpg + {id}.json pairs (see eval/README.md).`);
    process.exit(1);
  }

  const cases: EvalCase[] = [];
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
    const jpeg = await compress(path.join(dir, img));
    const r = await extractReceipt({ base64: jpeg.toString("base64"), mimeType: "image/jpeg" }, geminiReceiptClient, { fallbackCurrency: "INR" });
    cases.push({ id, truth, predicted: r.ok ? r.data : null, latencyMs: r.latencyMs });
    console.log(`${id}: ${r.ok ? `${r.data.items.length} items, total ${r.data.totalMinor / 100}` : `FAILED (${r.reason})`} in ${(r.latencyMs / 1000).toFixed(1)} s`);
  }

  const summary = scoreEval(cases);
  const results = {
    status: "ok",
    dataset: label,
    model: geminiModel(),
    runAt: new Date().toISOString(),
    ...summary,
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2) + "\n");

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const report = [
    `# Receipt extraction eval — ${label}`,
    "",
    `- Model: \`${results.model}\``,
    `- Run at: ${results.runAt}`,
    `- Receipts: ${summary.n}`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Item precision | ${pct(summary.precision)} |`,
    `| Item recall | ${pct(summary.recall)} |`,
    `| Item F1 | ${pct(summary.f1)} |`,
    `| Total accuracy (±₹1) | ${pct(summary.totalAccuracy)} |`,
    `| Reconciliation rate (\\|diff\\| ≤ ₹1) | ${pct(summary.reconciliationRate)} |`,
    `| Mean latency | ${summary.meanLatencySec.toFixed(2)} s |`,
    "",
    "| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |",
    "|---|---|---|---|---|---|---|",
    ...summary.perReceipt.map(
      (r) => `| ${r.id}${r.error ? " (failed)" : ""} | ${r.predictedItems} | ${r.truthItems} | ${r.matched} | ${r.totalCorrect ? "yes" : "no"} | ${r.reconciled ? "yes" : "no"} | ${r.latencySec} |`,
    ),
    "",
    "Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(out, "REPORT.md"), report);
  console.log(`\nP ${pct(summary.precision)} · R ${pct(summary.recall)} · F1 ${pct(summary.f1)} · total ${pct(summary.totalAccuracy)} · reconciled ${pct(summary.reconciliationRate)}`);
  console.log(`wrote ${path.join(out, "results.json")} and ${path.join(out, "REPORT.md")}`);
}

main().catch((e) => {
  console.error("eval failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
