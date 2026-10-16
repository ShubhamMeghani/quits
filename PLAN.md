# Quits — Build Plan

| | |
|---|---|
| Spec | [SPEC.md](SPEC.md) **v1.2**. If SPEC.md and this plan disagree, SPEC.md wins. |
| Production | https://quits-go.vercel.app (Vercel, deploys from `main`) |
| Stack | Next.js (App Router, TS) · Tailwind · Vitest · Supabase Postgres (server-only, RLS on, no policies) · Gemini `gemini-3.5-flash-lite` · Frankfurter v2 · Vercel Hobby · GitHub Actions (ubuntu-24.04) · Node 24 |
| Tests | `npm test` (unit, `lib/` + `server/token.ts`) · `npm run test:db` (DB integration; loads `.env.local`; skips when `SUPABASE_DB_URL` is absent) · `npm run test:db:clean` (removes leftover `__test__` groups) · `npm run lint` · `npm run build` · `npm run eval` (receipt eval; loads `.env.local`) |
| Migrations | `npm run db:push`: applies `supabase/migrations/*.sql` using `SUPABASE_DB_URL` |

## Rules for the autonomous build

1. **Fix the spec, not the code.** Stop only if a requirement or AC would have to change: it is wrong, impossible, contradictory, or blocked by an external fact. Then write the proposed SPEC change (R#/AC-#, old text → new text, reason) and wait. Never weaken, skip or delete a test to make it pass.
2. **Commits:** one commit per phase, in Conventional Commits form, made with `/git-commit`. The body lists the R# and AC-# covered. Example: `feat(core): pure money, split and simplify modules`, body `R13 R19–R21; AC-1–AC-12`.
3. **Never push**, force, amend or rewrite history. Pushing (which triggers CI and the Vercel deploy) is a [HUMAN] task.
4. **Secrets:** never read, open, `cat`, print, edit, copy or commit `.env.local` or any secret. Never echo or log any env value, and never ask for keys in chat.
   - Scripts load the env themselves, preferably with `node --env-file=.env.local` (built into Node 24), or with `dotenv`.
   - Running such npm scripts is allowed. Values are referenced only by variable name.
5. **Before each commit:** `npm run lint && npm test` must pass (plus `npm run build` from Phase 4 on, and `npm run test:db` from Phase 3 on).
6. **AC status:** in the same commit, update the AC status table below: status plus evidence (test file › test name, or a command and its result). Deploy, Phone and Desktop ACs stay **Not run** until the human records them. Claude may add "local pass" to the evidence.
7. **[HUMAN] tasks:** skip them and keep doing the [AUTO] tasks that don't depend on them. At the end of the run, list every pending [HUMAN] task in order.
8. **Dependencies:** only these, unless a SPEC change is approved.
   - Runtime: `next`, `react`, `react-dom`, `tailwindcss`, `@supabase/supabase-js`, `@google/genai`, `zod`, `qrcode`, `server-only`, `jsqr` (R60, Should; only used when the browser has no `BarcodeDetector`).
   - Dev: `typescript`, `vitest`, `eslint` + Next config, `supabase` (CLI), `postgres` (DB tests only), `tsx`, `dotenv` (only if `--env-file` cannot be used), `sharp` (icon generation), `@types/*`.
   - Charts, CSV, Levenshtein and image compression are hand-written.
9. **Migrations:** never edit a migration that has been applied; add a new file instead.

---

## Phase 1 — Deployment check of risky external pieces (interactive, before the overnight build)

**Goal:** prove that every external service works end to end on the real deployment, before any feature code.

**Env vars the human sets (Claude never sees the values):**

| Name | `.env.local` | Vercel (Production + Preview) | GitHub |
|---|---|---|---|
| `SUPABASE_URL` | ✓ | ✓ | — |
| `SUPABASE_SECRET_KEY` | ✓ | ✓ | — |
| `SUPABASE_DB_URL`: the **Session pooler** connection string (IPv4), not the direct connection. Used for migrations and DB tests. | ✓ | **never** | — |
| `GEMINI_API_KEY` | ✓ | ✓ | — |
| `GEMINI_MODEL` = `gemini-3.5-flash-lite` | ✓ | ✓ | — |
| `SCAN_LIMIT_PER_GROUP`, `SCAN_LIMIT_PER_APP` (optional; defaults 30/300) | optional | optional | — |
| `APP_URL` = production URL | — | — | **repository variable** (not a secret) |

No GitHub secrets are needed: CI runs only lint and unit tests, which make no network calls.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 1.1 | Scaffold Next.js (TS, App Router, Tailwind, ESLint), Vitest with one smoke test, the npm scripts above, `.nvmrc` = 24, and `engines`. | AUTO | R58 · P1-1 |
| 1.2 | `.env.example` with the names above; confirm `.gitignore` covers `.env*`. | AUTO | R54 |
| 1.3 | `.github/workflows/ci.yml`: ubuntu-24.04, Node 24, `npm ci`, lint, `npm test`. | AUTO | R58 · P1-2 |
| 1.4 | Push `main`; check that CI is green. | HUMAN | P1-2 |
| 1.5 | Vercel: import the GitHub repo, production branch `main`. | HUMAN | P1-3 |
| 1.6 | Supabase: create the project (region Mumbai). Put the URL, secret key and DB URL into `.env.local`, and the URL and secret key into Vercel. The DB URL is the **Session pooler** string (Connect → Session pooler, IPv4), not the direct connection. | HUMAN | R54 |
| 1.7 | Migration `0000_health.sql`: table `_health`, one row, RLS on, no policies. Run `npm run db:push`. | AUTO | R54 · P1-4 |
| 1.8 | `server/db.ts` (`server-only`, secret key) and `GET /api/health`, which returns `{"ok":true}` or 503. | AUTO | R54, R57 · P1-4 |
| 1.9 | `.github/workflows/keepalive.yml` (daily `30 3 * * *` + `workflow_dispatch`) calling `${{ vars.APP_URL }}/api/health`. | AUTO | R57 · P1-5 |
| 1.10 | Set the repo variable `APP_URL`, then run the keep-alive manually. | HUMAN | P1-5 |
| 1.11 | Create a Gemini key in Google AI Studio and set `GEMINI_API_KEY` and `GEMINI_MODEL` locally and in Vercel. | HUMAN | R31 |
| 1.12 | `/lab/receipt` (file picker, camera, paste; canvas compression to < 1 MB, with the size shown) and `/api/lab/extract` (size and magic-byte check, Gemini structured output, zod). Both are `noindex`. | AUTO | R27, R29–R31 · P1-6 |
| 1.13 | Photograph a real bill with the Samsung phone on the deployed `/lab/receipt`, and confirm the JSON appears in < 20 s. | HUMAN | P1-6 |
| 1.14 | Probe Frankfurter v2 for USD→INR on 2026-10-01 and on a Sunday. Record the exact URL and response shape, and propose the SPEC §4.3 update. | AUTO | R16 · P1-7 |
| 1.15 | Approve the §4.3 Frankfurter update (this becomes SPEC v0.4). **Done 2026-10-16:** SC-1 to SC-3 approved and applied. | HUMAN | P1-7 |
| 1.16 | `/lab/upi`: a form (VPA, name, amount; nothing stored) that shows the `upi://pay` button and its QR code, built from `lib/upi.ts` (stub). | AUTO | R24 · P1-8 |
| 1.17 | On the Samsung phone, open the link in GPay, PhonePe and Paytm and record which apps fill in the amount. Scan the desktop QR code. | HUMAN | P1-8 |
| 1.18 | `manifest.webmanifest` and icons (192, 512, 512 maskable, apple 180) generated from `public/icon.svg` with `sharp`. | AUTO | R52 · P1-9 |
| 1.19 | Install the PWA from Chrome on Android, and confirm it opens standalone. | HUMAN | P1-9 |
| 1.20 | `npm run build`, then `grep -rE "sb_secret_\|AIza" .next/static` finds nothing. | AUTO | R54 · P1-10 |
| 1.21 | Once P1-6 is Pass, delete `/api/lab/extract` and `/lab/receipt`. Keep the compression helper in `app/_lib/compress.ts` for Phase 5. **Done 2026-10-16** after P1-6 passed. | AUTO | R30 |
| 1.22 | Commit `chore: phase 1 deployment checks`. | AUTO | — |

**Done when:** P1-1 to P1-10 Pass.
**Prove it:** `npm run lint && npm test && npm run build`, plus the human checks recorded in the table.

## Phase 2 — Pure core modules and unit tests

**Goal:** all money, split, simplification, currency, receipt, UPI, CSV, recurring and demo logic exists as pure modules and is fully unit-tested. No UI, no DB.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 2.1 | `lib/money.ts`: largest-remainder `allocate`, half-up rounding, major↔minor, `en-IN` formatting. | AUTO | R13 · AC-1, AC-2 |
| 2.2 | `lib/splits.ts`: equal, exact, percent and shares splits; validation errors that carry the difference; multiple payers; balances; `assertInvariants`. | AUTO | R9–R11, R14 · AC-1–AC-4 |
| 2.3 | Property test with a seeded PRNG: 1,000 random groups. | AUTO | R13, R14 · AC-5 |
| 2.4 | `lib/simplify.ts`: greedy (R20), exact DP with deterministic recovery, `n > 18` fallback, naive count, settle summary. Includes a brute-force reference used only in tests. | AUTO | R19–R22 · AC-9–AC-12 |
| 2.5 | `lib/currency.ts`: exponents, supported list, `BigInt` `convert`, v2 response parser (shape from P1-7), `getRate` with injected cache and fetcher, 5 s timeout → `RATE_UNAVAILABLE`, manual rate. | AUTO | R15–R18 · AC-6, AC-7 |
| 2.6 | `lib/receipt.ts`: zod schema, minor-unit conversion, `diff`, itemized allocation (printed total, signed remainder), `extractReceipt(image, client)` with 25 s timeout → `EXTRACT_FAILED`, eval metrics (normalization, Levenshtein, one-to-one matching). | AUTO | R31–R35, R37 · AC-17–AC-19, AC-23 |
| 2.7 | `lib/upi.ts`: `buildUpiLink`, `isValidUpiId`. Replaces the Phase 1 stub. | AUTO | R6, R24 · AC-13 |
| 2.8 | `lib/csv.ts`: BOM, RFC 4180 quoting, formula guard, column layout. | AUTO | R43 · AC-32 |
| 2.9 | `lib/recurring.ts`: `occurrencesDue` (weekly/monthly, month-end clamp, cap of 24). | AUTO | R45 · AC-34 (Should) |
| 2.10 | `lib/demo-seed.ts`: seed data per R48, with amounts tuned to the exact target balances. | AUTO | R48 · AC-36 |
| 2.11 | `server/token.ts`: CSPRNG base64url token and `isValidToken`. | AUTO | R1 · AC-26 (unit part) |
| 2.12 | Commit `feat(core): ...`. | AUTO | — |

**Done when:** AC-1–AC-7, AC-9–AC-13, AC-17–AC-19, AC-23, AC-26 (unit part), AC-32, AC-34, AC-36 Pass.
**Prove it:** `npm test`.

## Phase 3 — Database schema and server layer

**Goal:** every §4.1 table, atomic RPCs, and a server layer that enforces group ownership, the invariants, soft delete and activity logging.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 3.1 | `0001_schema.sql`: all §4.1 tables, foreign keys, CHECKs (`amount > 0`, `from ≠ to`), unique constraints, indexes, and RLS enabled on every table with no policies. | AUTO | R8, R14, R54 |
| 3.2 | `0002_rpc.sql`: `create_expense`, `update_expense`, `soft_delete`, `restore`, `create_settlement`. Each re-checks Σ payers = Σ splits = total in SQL and raises an error on violation. | AUTO | R8, R11, R12, R14, R23 |
| 3.3 | `npm run db:push`. | AUTO | — |
| 3.4 | `server/context.ts`: token → group (zod; `notFound()` for malformed or unknown tokens), `assertBelongs(groupId, ids)` → 404. zod schemas for every input. | AUTO | R1, R55 |
| 3.5 | Services: create group (base currency locked once expenses exist), members (add, rename, UPI ID; archive, Should), expenses (create, update with last write wins, soft delete, restore), settlements, and the group read model (balances plus `lib/simplify` suggestions). | AUTO | R1, R6, R7, R8–R12, R14, R15, R19–R23 |
| 3.6 | Activity logging for every §4.1 action, with `old → new` summaries. | AUTO | R42 |
| 3.7 | `next.config` headers: `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow` on `/g/*`. | AUTO | R56 |
| 3.8 | `tests/db/*.test.ts` (`npm run test:db`).<br>**Setup:** the suite skips automatically when `SUPABASE_DB_URL` is absent, so CI runs unit tests only. Test groups use the name prefix `__test__` and are deleted in `afterAll`.<br>**Covers:** invariants after writes; cross-group IDs → 404 with no rows changed; the RLS catalog query returns 0 rows; `set role anon` reads nothing from any table. | AUTO | R14, R54, R55 · AC-41, AC-43 (server part) |
| 3.9 | `npm run test:db:clean`: deletes leftover groups whose name starts with `__test__`, plus their rows. | AUTO | — |
| 3.10 | Commit `feat(db): ...`. | AUTO | — |

**Done when:** AC-41 (SQL part) and AC-43 (ownership part) Pass; AC-5 still Pass.
**Prove it:** `npm test && npm run test:db`.

## Phase 4 — Mobile UI: groups, expenses, balances, settle-up

**Goal:** the core loop works on a 360 px phone: create → share → pick identity → add expenses → settle with a UPI QR code → "Mark as paid".

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 4.1 | App shell: centered ≤ 640 px column, bottom nav (Expenses · Settle · Activity · Group), "+" button, loading and error states, AA tokens, 44 px targets. | AUTO | R50, R51 |
| 4.2 | Landing and create-group form (name, base currency, ≥ 2 members); `/g/[token]` with 404. | AUTO | R1, R15 |
| 4.3 | Share screen: the access notice, copy link, `navigator.share`; group-link QR code (Should). | AUTO | R2, R3 |
| 4.4 | Member picker with `localStorage` identity, "I'm not on the list", Switch person; recent groups (Should). | AUTO | R4, R5 |
| 4.5 | Members screen: add, rename, UPI ID with validation; archive (Should). | AUTO | R6, R7 |
| 4.5a | Should: "Set from my UPI QR" on the member screen. Decode the screenshot in the browser (`BarcodeDetector`, falling back to `jsqr`) with `lib/upi.ts` `parseUpiUri` (unit-tested). Send only `pa`/`pn`; the image never leaves the browser. Migration adds `members.upi_name`, which `pn` then uses. | AUTO | R60 · AC-46 |
| 4.6 | Expense list (50 per page), add/edit form with the 4 split types, live difference, default-split prefill, Group settings default split; multi-payer UI (Should). | AUTO | R8, R9, R10 |
| 4.7 | Expense detail, edit, soft delete; activity screen; Restore (Should). | AUTO | R11, R12, R42 |
| 4.8 | Settle screen: balances in words, naive/greedy/optimal counts and algorithm label, suggestions, Mark as paid, manual settlement. | AUTO | R22, R23, R51 |
| 4.9 | **QR-first UPI actions** per suggestion: the UPI QR (payee + amount, visible at every width); "Save QR image" (PNG labelled with payee and amount); "Show full screen" QR; "Copy UPI ID" with the amount in large text; no-UPI-ID and non-INR conditions. Nothing is recorded until "Mark as paid". > ₹1 lakh warning (Should). Reuse the `/lab/upi` QR code. | AUTO | R24–R26 |
| 4.9a | Should: best-effort "Pay via UPI" link labelled "May be blocked by some UPI apps"; opening it records nothing. | AUTO | R59 · AC-46 |
| 4.10 | Offline fallback page via service worker (Should). | AUTO | R53 |
| 4.11 | Commit `feat(ui): ...`. | AUTO | — |
| 4.12 | Push, then on the deployment run AC-14 (save QR → scan from gallery; full-screen QR → second phone), AC-15, AC-16, AC-27, AC-28, AC-29, plus AC-30 and AC-46 (Should). | HUMAN | — |

**Done when:** AC-14, AC-15, AC-16, AC-27, AC-28, AC-29 Pass.
**Prove it:** `npm run lint && npm test && npm run test:db && npm run build`, plus the human checks.

## Phase 5 — Receipt scan flow

**Goal:** photo, camera or paste → Gemini → review and correct → claim items on one phone → itemized expense.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 5.1 | Scan screen: file picker, `capture="environment"`, clipboard paste, the Gemini notice; drag-and-drop (Should). | AUTO | R27, R28, R31 |
| 5.2 | Browser compression helper (canvas: ≤ 2000 px, quality 0.85 → 0.5, then shrink), building on `app/_lib/compress.ts` from 1.21. | AUTO | R29 |
| 5.3 | `POST /api/g/[token]/receipts/extract`: 413/415 checks, `rate_limits` buckets (`SCAN_LIMIT_*`) → 429, `@google/genai` structured output via `lib/receipt.extractReceipt`, image never stored or logged. | AUTO | R30, R31, R32 |
| 5.4 | Review screen: every field editable, add and remove items, live `diff`, mismatch banner, Retry and Enter manually. | AUTO | R32, R33 |
| 5.5 | Item claiming on one device (member chips; finalize blocked when an item is unassigned or Σitems = 0). | AUTO | R34 |
| 5.6 | `0003_receipts_rpc.sql` `finalize_receipt`: printed-total expense, remainder allocation, link, `receipt.finalized`. Per-item breakdown and mismatch badge on the expense. | AUTO | R35 |
| 5.7 | Draft receipts claimable from other devices (Should). | AUTO | R36 |
| 5.8 | Check that no route other than the rate-limited extract route calls Gemini, and that `/lab/*` holds only `/lab/upi`. | AUTO | R30 |
| 5.9 | AC-21 run locally: `npm run dev` with `SCAN_LIMIT_PER_GROUP=2` set in the shell, then `curl` with a 2 MB file, a renamed `.txt` file, and 3 valid scans. | AUTO | AC-21 |
| 5.10 | Commit `feat(receipts): ...`. | AUTO | — |
| 5.11 | Push, then run AC-20 (phone camera + desktop paste) and AC-22. | HUMAN | — |

**Done when:** AC-20, AC-21, AC-22 Pass; AC-17–AC-19 still Pass.
**Prove it:** `npm test && npm run test:db && npm run build`, plus the AC-21 `curl` log.

## Phase 6 — Multi-currency, search, charts, CSV, recurring, demo

**Goal:** every remaining feature, including the demo the evaluator will open.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 6.1 | Currency picker in the expense form; `fx_rates` cache and Frankfurter v2 adapter; re-fetch only when the date or currency changes; manual-rate dialog; display of the rate and rate date. | AUTO | R15–R18 |
| 6.2 | `test:db` case: a USD expense dated 2026-10-01 stores the adapter's rate; editing its description keeps the rate. | AUTO | AC-8 (local part) |
| 6.3 | Search (text, categories, person, date range; count and total). | AUTO | R40 |
| 6.4 | Per-person and per-category SVG bar charts (Should). | AUTO | R41 |
| 6.5 | `GET /api/g/[token]/export.csv` using `lib/csv`. | AUTO | R43 |
| 6.6 | Recurring rules UI and lazy materialization in the group read (Should). | AUTO | R44–R46 |
| 6.7 | `0004_demo_rpc.sql`: `demo_create` (deletes demos older than 7 days first, then seeds) and `demo_reset`. "Try the demo" button, demo banner, Reset action. | AUTO | R47–R49 |
| 6.8 | `test:db` cases: the seeded balances equal AC-36; reset restores them; a backdated demo is deleted on the next create; reset on a non-demo group is rejected. | AUTO | AC-38 (server part) |
| 6.9 | Commit `feat(features): ...`. | AUTO | — |
| 6.10 | Push, then run AC-8, AC-31, AC-33 (Should), AC-35 (Should), AC-37 and AC-38 on the deployment. | HUMAN | — |

**Done when:** AC-8, AC-31, AC-37, AC-38 Pass (AC-33 and AC-35 if their Shoulds were built).
**Prove it:** `npm test && npm run test:db && npm run build`.

## Phase 7 — Receipt eval, About page, README, security, polish

**Goal:** measured and published accuracy, a verified security posture, and documentation good enough to grade.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 7.1 | Collect at least 5 real receipts (SPEC v1.1, D-33; 5 done) (restaurant, café, grocery, delivery screenshots), blur personal data, save as `eval/receipts/{id}.jpg`. | HUMAN | R37 |
| 7.2 | Draft the ground-truth `{id}.json` for each image. | AUTO | R37 |
| 7.3 | Check and correct every ground-truth JSON against its image. | HUMAN | R37 |
| 7.4 | `eval/run.ts` (`npm run eval`) → `eval/results.json` and `eval/REPORT.md`. | AUTO | R37 · AC-24, AC-25 (Should) |
| 7.5 | `/about` renders the committed `results.json` with no live calls. | AUTO | R38 · AC-24 |
| 7.6 | Security sweep: build and grep `.next/static`; grep `git log -p --all`; confirm `.env.local` is gitignored. | AUTO | R54 · AC-42 (script part) |
| 7.7 | Remove `/lab/upi`; final responsive pass on all screens at 360 px. | AUTO | R50 |
| 7.8 | `README.md`: live URL, demo steps, local setup, env variable names, deploy, test/eval commands, UPI app results (AC-14), known limitations (incl. last write wins), AC checklist. | AUTO | §7 |
| 7.9 | Commit `docs: eval, about, readme, security sweep`. | AUTO | — |
| 7.10 | Push, then: AC-26 404 on prod; AC-43 `curl` checks (headers and cross-group); AC-41 REST with the publishable key; AC-42 network log across all flows; AC-44 503 with a wrong DB URL on a preview deployment; AC-39 and AC-40 on the phone; AC-37 in incognito; AC-45 on the final commit. | HUMAN | AC-26, AC-37, AC-39–AC-45 |

**Done when:** every Must AC is Pass.
**Prove it:** `npm run lint && npm test && npm run test:db && npm run build && npm run eval`, plus the table below with evidence.

## Phase 8 — Type-to-add (A, Must) and WhatsApp share and nudge (B, Should) (SPEC v0.7)

**Goal:** add an expense by typing or dictating a sentence in English or Hinglish, which fills the form for review, never saving on its own. Then share the settle-up summary and send polite reminders on WhatsApp, without storing phone numbers.

### 8A — Type-to-add (Must)

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 8.1 | `lib/nlparse.ts` (pure): zod schema for the model output; name matching (first or full name, case-insensitive; no match or several matches → blank and flagged; never creates members); "me / I / maine / mujhe / mera" → current member; validation of amount, currency (otherwise base), date (not future, ≤ 1 year old) and category; the split checked with `lib/splits.ts` (invalid → values blank); output `{ prefill, flags }`. Unit tests. | AUTO | R62, R63 · AC-47, AC-48, AC-49 |
| 8.2 | NL prompt and `responseJsonSchema` constants in `lib/nlparse.ts`; generalize `server/gemini.ts` to a text + JSON-schema call (15 s timeout). | AUTO | R61 |
| 8.3 | `POST /api/g/[token]/expenses/parse`: zod input (text 1–300 chars, `me`); group from token; limits (per-group `nl:group:{id}` bucket, `NL_LIMIT_PER_GROUP` default 50, plus the shared `scan:app` daily AI bucket) → 429 before any Gemini call; Gemini → `lib/nlparse` → `{ prefill, flags }`. Handler takes injected deps so it can be tested with a mocked Gemini. | AUTO | R61, R64, R65 · AC-50 |
| 8.4 | "Type it" box at the top of Add expense: textarea (300 chars, with a hint to use the keyboard's mic), "Fill form", loading and error states. Fills the existing `ExpenseForm` state, highlights blank or ambiguous fields, and never saves. | AUTO | R61, R64 |
| 8.5 | `eval/nl/`: draft 20 sentence + ground-truth pairs in English and Hinglish, about 5 deliberately ambiguous with blank expected fields. Fixed member list, `me`, and "today" per file. | AUTO | R66 |
| 8.6 | Write about 10 more sentences in your own words, and review all of them. **Pending (human).** | HUMAN | R66 |
| 8.7 | `npm run eval:nl` (`eval/nl/run.ts`): same prompt, schema, model and post-processing; metrics are pure, unit-tested functions (field accuracy, exact match, abstention); writes `eval/nl/results.json` and `REPORT.md`. Add the NL results to `/about` next to the receipt eval, showing "not run yet" until the real run. | AUTO | R66 · AC-51 |

### 8B — WhatsApp share and nudge (Should)

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 8.8 | `lib/share.ts` (pure): summary and reminder text per SPEC §4.3 ("₹" with en-IN grouping, whole rupees without decimals; D-22); `waLink(text)`. Exact-string unit tests. | AUTO | R70 · AC-54 |
| 8.9 | Settle screen: "Share summary" (Web Share API, otherwise `wa.me`; "Copy" on desktop) and "Remind" on each suggested payment (`wa.me/?text=`). No phone numbers are stored. | AUTO | R68, R69 |
| 8.10 | Commit `feat(nl,share): ...`. | AUTO | — |
| 8.11 | **Pending (human).** Push, then: AC-53 on the phone (type or dictate, form fills, nothing saved); AC-55 (Remind opens WhatsApp prefilled; Share summary; Copy on desktop); run `npm run eval:nl` on all ~30 sentences, or ask Claude to, then check AC-51 and AC-52 on `/about`. | HUMAN | AC-51–AC-53, AC-55 |

**Done when:** AC-47–AC-51 and AC-53 Pass (plus AC-52, AC-54 and AC-55 if their Shoulds are built).
**Prove it:** `npm run lint && npm run typecheck && npm test && npm run test:db && npm run build && npm run eval:nl`, plus the human checks.

---

## SPEC change proposals

**Status: approved 2026-10-16 and applied in SPEC v0.4.** These were wording changes only; the code already followed them.

| ID | Where | Change | Why |
|---|---|---|---|
| SC-1 (task 1.15) | §4.3 Frankfurter v2 | **Request:** `GET https://api.frankfurter.dev/v2/rate/{BASE}/{QUOTE}?date=YYYY-MM-DD`.<br>**Response:** `{"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}`, where `rate` is a JSON number.<br>**Dates:** weekends and holidays return a blended rate for that same date; dates after today return 404, so those requests omit `date` and get the latest rate; an unknown currency returns 422. | Confirmed by probing in P1-7. D-17 still holds. |
| SC-2 | §3 Stack, Gemini | `responseSchema` → `responseJsonSchema` | In `@google/genai` 2.x, `responseJsonSchema` is the field that takes a plain JSON Schema. Same behaviour: structured JSON output. |
| SC-3 | R17 | "weighted by their original-currency amounts" → "weighted by their exact original-currency proportions: payer amounts, or the split's own weights (1 per person for equal, basis points, shares, or exact amounts)" | AC-6 expects an equal USD split to stay equal in INR (`[34329, 34329, 34328]`). Weighting by the *rounded* cent shares (412/411/411) would give `[34384, 34301, 34301]`. The code uses the exact proportions, which satisfies both AC-6 and the intent of R17. |

---

## Build log

- **2026-10-16, Phases 1–3 (unattended run):**
  - Phase 1 AUTO tasks are done. Task 1.21 (delete `/api/lab/extract` and `/lab/receipt`) was done after P1-6 passed on the phone; the routes leave production on the next push.
  - Phase 2 is done: 78 unit tests.
  - Phase 3 is done: migrations `…000100` to `…000400` are applied, and there are 15 DB tests.
  - Two fix-up migrations were added rather than editing applied ones:
    - `…000300`/`…000400`: member FKs are now `DEFERRABLE INITIALLY DEFERRED`, so deleting a whole group (demo reset, test cleanup) can cascade.
    - The UPI-ID check no longer uses a regex `{2,256}`, which Postgres rejects (bound max 255).
- **2026-10-16, Phase 1 complete:**
  - All checks P1-1 to P1-10 pass, at production https://quits-go.vercel.app.
  - Task 1.21 was done in `8460e83`; the compression helper stays in `app/_lib/compress.ts` for Phase 5.
  - P1-8 led to SPEC v0.5: QR-first settle-up (D-18).
- **2026-10-16/17, Phase 4 (unattended run):**
  - **UI built:** group shell (identity gate, bottom nav), expenses, add/edit form, Settle (QR-first), activity, group hub, share, members (incl. R60 QR import), settings, landing, offline page.
  - **Checking without the browser extension:** the UI was checked with scripted headless Chrome over the DevTools protocol (local `next start`, real Supabase): a 75-step core-loop flow, an R60 upload flow with a network check, and screenshots plus a tap-target/overflow audit at 360 px and 1440 px.
  - **Migration:** `…000500` adds `members.upi_name`.
- **Phase 5:**
  - **Receipt flow:** scan (camera, picker, paste, drag-and-drop) → `/api/g/[token]/receipts/extract` (413/415, then scan limits → 429, then Gemini) → draft review/claim editor → `finalize_receipt`.
  - **Drafts** are listed on the Expenses tab, so other devices can claim their items (R36); refresh shows others' claims.
  - **Migration:** `…000600` (scan counter, draft save, finalize).
  - **Checks:** AC-21 via curl; the receipt UI flow (paste, mismatch, claim, finalize, unassigned block, draft) via headless Chrome.
- **Phase 6:**
  - **Currency:** the picker and manual-rate field were already in the form from Phase 4; live Frankfurter v2 is verified by a DB test.
  - **Features:** search and stats (`/search`, a GET form); CSV route; recurring rules (Should), generated lazily in `readGroup`, with pause/resume/stop; demo create/reset RPCs with lazy cleanup.
  - **Migration:** `…000700`.
  - **Demo seed changes:** no recurring rules, since a monthly rent rule dated 40 days back would generate an occurrence on first open and break the exact R48 balances. All Goa items are categorised Travel (for AC-31), and "Flat rent" no longer names a month.
  - **v0.6 update:** the demo now has one monthly "Flat rent" rule. Rent moved to 15 days ago; it is the rule's latest occurrence, and the next due date is always in the future, so opening the demo creates nothing and the balances stay exact (migration `…000800`; unit and DB tests).
  - **R46 (Should) partial:** rules can be paused, resumed or stopped, but not edited; to change a rule, stop it and add a new repeating expense.
- **Phase 7 (AUTO tasks):**
  - **Eval:** `eval/run.ts` (`npm run eval`, plus `npm run eval:synthetic`) is built and checked on ONE synthetic receipt only (`eval/synthetic/`). No real results were invented: the committed `eval/results.json` says "not-run", and `/about` shows that.
  - **Task 7.2 (draft ground truth) is waiting on 7.1:** there are no real images yet. `eval/README.md` documents the ground-truth format.
  - **2026-10-17 update (7.1–7.4 on 5 receipts):** the human added 5 real receipts (r01–r05: 3 restaurant bills, 2 delivery screenshots). Claude drafted the ground truth by reading the images (no Gemini); the human checked every value against the paper bills and marked all 5 `"reviewed": true`. Address (r03) and order ID (r04) covered with black boxes. Rules settled in review: r01's "Dimsums Extra" stays inside its 575 line; "Staff Contribution (Voluntary)" and platform fees count as service charge; a delivery app's total is the amount **paid** after coupons (r04: 87.69, not 227.69). First real run: P 98.0%, R 100%, F1 99.0%, total accuracy 100%, reconciliation 60% (r01, r04 not reconciled), mean 5.9 s.
  - **SPEC v1.1 (D-31–D-33):** R37 now asks for at least 5 receipts; results say "n = 5, small sample". The receipt eval saves each receipt's predictions (run 1 kept; run 2 is the main result: F1 92.3%, total 80%, reconciliation 40%, r02 timed out at 25 s). r01: the "Dimsums Extra … = 150" modifier is read as its own item (diff −150). r04: the ₹14.99 platform fee is dropped (diff +14.99). NL REPORT.md and /about add answer rate + accuracy when answered for runs 1–3 (from saved results, no re-run). Not changed: the receipt prompt (see the proposals in the run-2 report to the human).
  - **SPEC v1.2 (D-34, D-35):** both receipt-prompt gaps fixed as product bugs (add-on lines stay inside their item; platform, packaging, convenience and delivery fees go in `service_charge`), with unit tests in tests/unit/receipt.test.ts › D-34 (mocked model: prompt rules pinned; the run-2 readings give −₹150 / +₹14.99 mismatches, the fixed readings give diff 0 and a correct split). Run 3 (main; not blind for r01/r04): answer rate 80% (r01 timed out at 25 s, so the add-on fix is not measured on a real receipt); r04 now reconciles (fee read as service 14.99); all 4 answered receipts reconcile. Receipt answer rate + accuracy when answered reported for runs 1–3. No more receipt re-runs.
  - **Live checks on production (human, 2026-10-17, all PASS):** AC-37, AC-31, AC-33, AC-38 (demo); AC-27 part 1, AC-28, AC-29, AC-30; AC-35, AC-8; the laptop parts of AC-15 and AC-16 (incl. a USD group showing no UPI actions); AC-20 desktop paste, AC-22, AC-55 desktop Copy, AC-39 desktop; AC-24 and AC-51 (/about); AC-26 (404). Still pending, all on the phone: AC-14, AC-15, AC-16 (Mark as paid), AC-20 (camera), AC-27 parts 2–5, AC-39, AC-40, AC-46, AC-53, AC-55; plus AC-41 (REST), AC-42 (prod network log) and AC-44 (preview 503) on the laptop.
  - **`fix(ui)` (2026-10-17, unattended):**
    - **BUG-3:** Search had no visible entry point (only by typing `/search`). The Expenses heading now has a labelled **Search** button with a magnifier (44 px tall), linking to `/g/{token}/search`. Unit test tests/unit/ui-search.test.tsx › BUG-3; headless Chrome 360 px: the button is visible on the Expenses tab (111×44 px) and opens the search page.
    - **POLISH-1:** each category bar on the search page shows "· N% of total". `lib/stats.ts` `percentShares` allocates tenths of a percent with R13's largest-remainder rule, so the shown figures add up to exactly 100.0%. Unit tests: even splits, thirds and sevenths, 500 random inputs (sum 100.0, each within 0.1 point), zero/empty/negative. Headless Chrome on the demo: 7 categories, 47.1 … 1.7 = 100.0%, one line each at 360 px. No requirement or AC changed (R40, R41).
  - **Done:** the security sweep, removal of `/lab/upi`, the README, and the AC table.
- **2026-10-17, bug fixes and Phase 8 (unattended run):**
  - **`fix(ui)`:**
    - Split-row names were squeezed to zero width (`w-full` vs fixed width in Tailwind's stylesheet order). Fixed with `inputFixed`, a presentational `SplitRows`/`PayerRows` component, and a unit test.
    - On phones, "Save QR image" / "Show full screen" are stacked, so the R24 labels stay on one line.
    - The headless-Chrome audit at 360, 390 and 1440 px shows no wrapped labels.
  - **8A:** `lib/nlparse.ts`, the parse route (per-group limit plus the shared daily AI limit; one retry on a transient model error inside the 15 s deadline), "Type it" on Add expense, 20 drafted NL sentences (5 ambiguous), `npm run eval:nl` with a `--check` mode, and /about.
  - **The NL eval was NOT run:** it waits for the human's 10 sentences and the review of all 30.
  - **8B:** `lib/share.ts` (exact strings, "₹"), plus Share summary, Copy and Remind on Settle.

---

## AC status

Rows P1-1 to P1-10 are the Phase 1 checks; each one de-risks the spec ACs shown in brackets. Every other row is a SPEC AC.

| AC | Type | Phase | Status | Evidence |
|---|---|---|---|---|
| P1-1 Scaffold lint/test/build local [AC-45] | Script | 1 | Pass | `npm run lint` clean; `npm run typecheck` clean; `npm test` 1/1; `npm run build` OK (Next 16.4.2, React 19.3) |
| P1-2 CI green on ubuntu-24.04 [AC-45] | Deploy | 1 | Pass | human 2026-10-16: CI green on f455567 (ubuntu-24.04: lint, typecheck, unit tests) |
| P1-3 Vercel prod deploy from GitHub | Deploy | 1 | Pass | human 2026-10-16: Vercel production https://quits-go.vercel.app from `main`; 4 env vars set for Production + Preview (no SUPABASE_DB_URL) |
| P1-4 `/api/health` via Supabase, RLS on [AC-41, AC-44] | Deploy | 1 | Pass | human 2026-10-16: `GET https://quits-go.vercel.app/api/health` → `{"ok":true}`; earlier local pass with `_health` (RLS on) |
| P1-5 Keep-alive `workflow_dispatch` green [AC-44] | Script | 1 | Pass | human 2026-10-16: repo variable `APP_URL` set; Keep-alive run #1 green, logged `{"ok":true}` |
| P1-6 Phone photo < 1 MB → Gemini JSON [AC-20] | Phone | 1 | Pass | human 2026-10-16 (Samsung, Chrome, prod): real bill 3,986,619 → 415,486 bytes uploaded (≤ 1 MB); HTTP 200 in 9.0 s (Gemini 6.7 s); items, tax and total match the bill. Lab route deleted in 1.21 |
| P1-7 Frankfurter v2 historical + weekend USD→INR [AC-8] | Script | 1 | Pass | `GET /v2/rate/USD/INR?date=2026-10-01` → `{"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}`; Sunday 2026-10-04 → 96.19 (same date); future date → 404. Recorded in SPEC v0.4 §4.3 (SC-1) |
| P1-8 UPI link in GPay/PhonePe/Paytm + QR [AC-14, AC-15] | Phone | 1 | Pass (via QR) | human 2026-10-16 (Samsung, prod `/lab/upi`): the `upi://` "Pay via UPI" deep link is **blocked** in GPay, PhonePe and Paytm (P2P intent links from websites restricted; GPay shows a misleading "exceeded bank limit" at ₹1). QR shown on the laptop, scanned by the phone: works, payee and ₹1.00 prefilled. QR screenshot scanned from the gallery in GPay: works. Led to SPEC v0.5: QR-first settle-up (D-18) |
| P1-9 PWA installs on Android [AC-40] | Phone | 1 | Pass | human 2026-10-16 (Samsung, Chrome, prod): installed via "Install app and create shortcut"; opens standalone with no address bar, teal status bar, Q icon on the home screen |
| P1-10 No secrets in `.next/static` [AC-42] | Script | 1 | Pass | `grep -rE "sb_secret_\|AIza" .next/static` → no matches |
| AC-1 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-1 (equal ₹100/3, 100 paise/7); tests/unit/money.test.ts › AC-1 |
| AC-2 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-2 (percent 999 → [499,250,250]; shares 1001 → [501,250,250]) |
| AC-3 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-3 (EXACT_MISMATCH diff 1; PERCENT_MISMATCH 99.99) |
| AC-4 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-4 (3 cases incl. multi-payer and soft delete) |
| AC-5 | Unit | 2 | Pass | tests/unit/invariants.test.ts › AC-5 (1,000 groups, >10,000 expenses, 5 split types, 5 currencies) |
| AC-6 | Unit | 2 | Pass | tests/unit/currency.test.ts › AC-6 (USD 102986 → [34329,34329,34328]; THB 2362; JPY 56120); matches R17 as worded in SPEC v0.4 (SC-3) |
| AC-7 | Unit | 2 | Pass | tests/unit/currency.test.ts › AC-7 (timeout → RATE_UNAVAILABLE; manual rate source = manual) |
| AC-8 | Deploy | 6 | Pass | local DB test (tests/db/features.test.ts › AC-8) with live Frankfurter v2: USD 10.00 on 2026-10-01 stores 95.98 (rate date 2026-10-01, source frankfurter, cached in fx_rates); description edit keeps 95.98; date → 2026-10-04 re-fetches 96.19; INR → identity; base-currency change rejected. UI shows "1 USD = 95.98 INR on …". **Prod Pass 2026-10-17 (human):** USD 10.00 on 2026-10-01 → 95.98; description edit keeps it; date → 2026-10-04 → 96.19; base currency locked once expenses exist. |
| AC-9 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-9 (greedy 4 exact sequence; optimal 3 exact sequence; both zero balances) |
| AC-10 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-10 (naive 3, greedy 1, optimal 1) |
| AC-11 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-11 (edge cases; 300 random n ≤ 8 = brute force) |
| AC-12 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-12 (18 balances well under 2 s; 19 → greedy/null; deterministic) |
| AC-13 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-13 (exact link string; UPI ID accept/reject list) |
| AC-14 | Phone | 4 | Pending (human) | local: Settle renders a 220 px UPI QR per suggestion with "Save QR image" (PNG with payee + amount) and "Show full screen"; phone scan from gallery / second phone pending (4.12) |
| AC-15 | Desktop + Phone | 4 | Partial | local headless Chrome 1440×900: QR visible on Settle with no toggle; "Copy UPI ID" next to the amount in large text. **Prod 2026-10-17 (human): laptop part Pass** (QR shown with no toggle; Copy UPI ID pastes the exact ID; amount in large text). Phone scan of the desktop QR pending. |
| AC-16 | Deploy | 4 | Partial | local headless Chrome flow (360 px): "Mark as paid" → Confirm records "Priya paid you", balances update, activity "Recorded payment: Priya paid Aarav ₹200.00"; payee without UPI ID shows "Add a UPI ID for Aarav". **Prod 2026-10-17 (human): laptop parts Pass** ("Add a UPI ID for Rahul"; a USD group shows no UPI actions). "Mark as paid" on the deployment pending (phone P5). |
| AC-17 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-17 (diff 0 / +150; 100 not flagged, 101 flagged) |
| AC-18 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-18 (₹840 and ₹845 cases, shared ₹100 item, negative remainder) |
| AC-19 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-19 (12.5 → 1250; missing items / negative rejected; timeout → EXTRACT_FAILED) |
| AC-20 | Phone + Desktop | 5 | Partial | local headless Chrome (360 px): desktop-paste path — a pasted receipt image (ClipboardEvent) was compressed, read by Gemini and opened in review with items Masala Dosa \| Cold Coffee \| Paneer Roll; file-picker path also tested. P1-6 already proved the phone camera → ≤ 1 MB → JSON path on the Samsung. **Prod 2026-10-17 (human): desktop part Pass** (Ctrl+V of a receipt image → preview + extraction). Phone camera on the final UI pending. |
| AC-21 | Script | 5 | Pass | local `next start` with SCAN_LIMIT_PER_GROUP=2 in the shell, fresh group: 2 MB JPEG → 413; text renamed .jpg → 415; valid scans → 200, 200, then 429 "Daily scan limit reached — enter items manually". 413/415 did not count toward the limit, so they never reached Gemini; server log shows no extract errors. Also tests/db/receipts.test.ts › R30 counter |
| AC-22 | Deploy | 5 | Pass | local headless Chrome flow: editing an item amount shows the "Total mismatch" banner immediately and clears when fixed; finalizing with an unassigned item shows "Choose who had …"; after claiming, finalize creates an itemized ₹660.00 expense (printed total) with per-item breakdown and per-person ₹132/₹330/₹198. DB test: printed ₹845 vs ₹840 → [31688, 21125, 31687] + mismatch. **Prod Pass 2026-10-17 (human):** diff banner updates on edit; unassigned item blocks finalize; itemized expense = printed total with on-screen splits; a difference over ₹1 shows the badge. |
| AC-23 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-23 (P 0.667, R 0.5, F1 0.571; Paneer Tikka match) |
| AC-24 | Script + Deploy | 7 | Pass | local Pass 2026-10-17 (SPEC v1.2). eval/receipts r01–r05, all `"reviewed": true`. Run 3 (main; D-34 prompt fixes; not blind for r01/r04): answer rate 80% (4/5; r01 timed out at 25 s); overall P 100%, R 29.2%, F1 45.2%, total 80%, reconciliation 80%, mean 11.2 s; when answered P/R/F1 100%, total 100%, reconciliation 100%. Runs 2 and 1 kept (results-run2.json + REPORT-run2.md, results-run1.json + REPORT-run1.md). REPORT.md and /about: "n = 5, small sample", answer rate + accuracy when answered for runs 1–3 (D-35), run 3's blindness label, earlier runs under "Earlier runs". **Prod Pass 2026-10-17 (human):** /about shows run 3 with "n = 5, small sample", answer rate 80.0%, the blindness label and earlier runs. |
| AC-25 (Should) | Script | 7 | Fail | run 3 (n = 5, small sample): reconciliation 0.80 (≥ 0.70, meets) but F1 0.452 (< 0.80): r01's 34 items all count as missed because it timed out (25 s). When answered: F1 1.00, reconciliation 1.00. Run 2: F1 0.923, reconciliation 0.40; run 1: F1 0.990, reconciliation 0.60 |
| AC-26 | Unit + Deploy | 2 / 7 | Pass | unit Pass; local `next start`: /g/doesnotexist, /g/{random 22} and /g/{random}/settle → 404 "Group not found"; valid token 200. **Prod Pass 2026-10-17 (human):** /g/doesnotexist and a random 22-char token both show "Group not found" with status 404. |
| AC-27 | Desktop + Phone | 4 | Partial | local headless Chrome flow (360 px): create group → share notice "Anyone with this link can view and edit this group."; identity remembered across navigations ("You: Aarav"); Switch person → picker → Priya; adding "priya" → "Name already used". **Prod 2026-10-17 (human): part 1 Pass** (create group on desktop → share notice shown). Parts 2–5 on the phone pending. |
| AC-28 | Deploy | 4 | Pass | local flow: default split set to shares 2:1:1 → new expense form opens with "Shares" selected and values 2,1,1. **Prod Pass 2026-10-17 (human):** default shares → new expense form opens on Shares with those values. |
| AC-29 | Deploy | 4 | Pass | local flow: edit ₹500 → ₹600 logs "Aarav Edited “Snacks”: Amount ₹500.00 → ₹600.00"; delete → "No expenses yet" + activity entry; plus DB tests. **Prod Pass 2026-10-17 (human):** ₹500 → ₹600 logged with the actor's name; delete removed it from balances and search. |
| AC-30 (Should) | Deploy | 4 | Pass | local flow: Restore on the deletion entry → "Restored “Snacks”" and the expense is back in the list. **Prod Pass 2026-10-17 (human):** Restore brought "Snacks" back into balances with a "Restored" entry. |
| AC-31 | Deploy | 6 | Pass | local: demo search "swiggy" → exactly 4 (all Swiggy expenses); category Travel + Goa date range → exactly the 4 Goa expenses (DB test + headless Chrome "4 expenses"). **Prod Pass 2026-10-17 (human):** demo search "swiggy" → 4; Travel + Goa dates → 4. |
| AC-32 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-32 (BOM + header, formula guard, RFC 4180, deleted rows absent) |
| AC-33 (Should) | Desktop | 6 | Pass | local DB test: per-category totals sum to the filtered total; per-person and per-category bars render on /search at 360 px and 1440 px. **Prod Pass 2026-10-17 (human):** category bars sum to the filtered total. |
| AC-34 (Should) | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-34 (Jan 31 clamping; idempotent second call) |
| AC-35 (Should) | Deploy | 6 | Pass | local DB test (tests/db/features.test.ts › AC-35): monthly rule starting two months ago → exactly 3 expenses after one open, still 3 after the next; dates = start, +1 month, +2 months (= today). **Prod Pass 2026-10-17 (human):** monthly rule from two months ago → exactly 3 expenses; still 3 after another reload. |
| AC-36 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-36 (seed balances exact; greedy 4, optimal 3) |
| AC-37 | Desktop | 6 / 7 | Pass | local headless Chrome 1440×900, fresh profile: "Try the demo" → group open in 0.73 s; demo banner; 15 expenses; itemized beach-shack receipt with per-item breakdown; USD expense shows "1 USD = 95.98 INR"; Settle shows Optimal 3 · Greedy 4 · Naive 10 with "Showing the optimal plan". **Prod Pass 2026-10-17 (human, incognito):** Try the demo opened within 5 s; banner, ≥ 15 expenses, itemized beach-shack breakdown, USD rate, Settle Optimal 3 · Greedy 4 · Naive N with "Showing the optimal plan". |
| AC-38 | Deploy | 6 | Pass | local DB test (tests/db/features.test.ts › AC-38): after deleting an expense, reset restores the exact target balances under the same token; a demo backdated 8 days is deleted when the next demo is created; reset on a non-demo group → NOT_FOUND. UI reset works in headless Chrome. **Prod Pass 2026-10-17 (human):** deleted a demo expense, Reset demo → expense back, Settle numbers unchanged, same URL. Parts 2–3 by the DB test above. |
| AC-39 | Phone + Desktop | 7 | Partial | local headless Chrome 360×740, 11 screens: scrollWidth = innerWidth = 360 on all; all buttons/links/inputs ≥ 44 px (one header link fixed); 1440×900: centered ≤ 640 px column. **Prod 2026-10-17 (human): desktop part Pass** (centred column ≤ 640 px at ~1440 px; add, settle, scan completed). Real-phone part pending. |
| AC-40 (Should) | Phone | 7 | Partial | P1-9 Pass on the Samsung (standalone, Q icon) with the Phase 1 build; re-check on the final build pending (7.10) |
| AC-41 | Script | 3 / 7 | Partial | SQL Pass: tests/db/security.test.ts › AC-41 (0 tables without RLS; `set role anon` → permission denied on all 14 tables; anon cannot run RPCs). REST with publishable key pending (human, 7.10) |
| AC-42 | Deploy + Script | 7 | Partial | script Pass: `.next/static` 0 key-like strings and 0 references to supabase.co/generativelanguage; `git log -p --all` 0 key-like matches; `.env.local` ignored. Local browser Pass: headless Chrome walk-through (demo, settle, add expense, receipt paste, search, activity, members, about) made 225 requests, all to the app origin. Prod network log pending (7.10) |
| AC-43 | Script | 3 / 7 | Partial | server Pass: tests/db/security.test.ts › AC-43 (cross-group member → 404, no row; delete Y's expense via X → 404, unchanged; RPCs re-check). Local `curl -I` shows Referrer-Policy: no-referrer + X-Robots-Tag: noindex, nofollow. Prod curl pending (human) |
| AC-44 | Script | 1 / 7 | Partial | P1-5 Pass (keep-alive run #1 green, {"ok":true}); local `next start` with SUPABASE_URL set to an invalid host in the shell → /api/health 503 {"ok":false}. Preview-deployment check pending (7.10) |
| AC-45 | Script | 7 | Pass | local on the Phase 7 commit: `npm run lint` clean, `npm run typecheck` clean, `npm test` 83/83, `npm run test:db` 24/24, `npm run build` exit 0. CI re-checks lint/typecheck/unit tests on push |
| AC-46 (Should) | Unit + Phone | 4 | Partial | unit Pass (tests/unit/misc.test.ts › AC-46 parseUpiUri); local flow: uploading a UPI QR screenshot fills priya.sharma@okaxis + "Priya Sharma"; only network request was one 176-byte POST (no image); "Pay via UPI app" labelled "May be blocked by some UPI apps". Phone check pending (4.12) |
| AC-47 | Unit | 8 | Pass | tests/unit/nlparse.test.ts › AC-47 (priya/PRIYA/" Priya " → Priya; Rahul with two Rahuls → blank + ambiguous; Rahul Singh → Rahul Singh; Karan → blank + unknown; no member added; sab → everyone) |
| AC-48 | Unit | 8 | Pass | tests/unit/nlparse.test.ts › AC-48 (me/I/Maine/MUJHE/mera → current member; no current member → blank + no-me) |
| AC-49 | Unit | 8 | Pass | tests/unit/nlparse.test.ts › AC-49 (exact 300+200≠600 → blank; % 50+40 → blank; shares 2:1:1 kept; amount 0/-5 → blank; XYZ → INR; future, year-old and impossible dates → blank; "Party" → blank) |
| AC-50 | Unit | 8 | Pass | tests/unit/nl-route.test.ts › AC-50 (mocked Gemini: example sentence → expected prefill, no write dependency; 301 chars → 400; limit → 429 with no model call; timeout/invalid → 502 "Couldn't read that — try again"; one retry on a transient error, after the D-29 delay; a repeated 503 → `status: 503`, kept after a timeout (D-30); 404 for foreign group/me). UI (headless, mocked 502): Try again and "or fill in the form" shown; the latter focuses the form (D-28) |
| AC-51 | Script + Deploy | 8 | Pass | local Pass 2026-10-17. Run 3 (main, SPEC v1.0; eval-setup change Q3 = real Gemini statuses recorded; code change Q2 = 20 s limit + ~1 s wait before the one retry; not blind for P3/Q2): amount 76.7%, payer 76.7%, participants 80.0%, split type 80.0%, exact 76.7%, abstention 57.1%, mean 9.4 s; 6 of 30 had no answer (5 timeouts at 20 s, 1 model_error 503; claude-20 timed out after a 503). Of the 24 answered: amount 95.8%, exact 95.8%. D-31 (SPEC v1.1): REPORT.md and /about show answer rate + accuracy when answered for runs 1–3: answer rate 86.7% / 90.0% / 80.0%; exact when answered 92.3% / 92.6% / 95.8% (no re-run). Run 2 (results-run2.json) and run 1 (results-run1.json) kept verbatim in REPORT.md; local /about shows run 3 with run 2 and run 1 under "Earlier runs". **Prod Pass 2026-10-17 (human):** /about shows run 3, answer rate 80.0% ("24 of 30…") and "% when answered". |
| AC-52 (Should) | Script | 8 | Fail | run 3: amount 76.7% (< 95%); exact 76.7% (< 80%). Of the 24 answered: amount 95.8%, exact 95.8% (only miss human-05). The drop from run 2 (amount 86.7%, exact 83.3%) is the 6 no-answers under Gemini 503 / slow load, not wrong answers |
| AC-53 | Phone | 8 | Partial | local headless Chrome (360 px, real Gemini): "Rohan paid 600 for pizza, split with Kabir and me" → 600.00, payer Rohan, participants Aarav, Rohan, Kabir (D-21), Food & Drinks; expense count unchanged until Save; "Karan paid 300…" → payer blank + highlighted + Save disabled + "Couldn't find “Karan”"; "maine 450 diye auto ke, sab mein" → 450.00, you, all 5, Transport. Phone (typing + keyboard mic) pending (8.11) |
| AC-54 (Should) | Unit | 8 | Pass | tests/unit/share.test.ts › AC-54 (two-payment and settled-up summaries; reminders for ₹1,20,000 and ₹1,200.50; wa.me encoding incl. ₹ → %E2%82%B9, newline %0A, space %20) |
| AC-55 (Should) | Phone + Desktop | 8 | Partial | local: Settle shows "Share summary" + "Copy" and one "Remind … on WhatsApp" link per suggestion; the link decodes to the exact reminder ("Hi Kabir, a gentle reminder from Quits: please pay Aarav ₹4,000 for …"). **Prod 2026-10-17 (human): desktop Copy Pass.** Phone Remind / Share summary pending. |
