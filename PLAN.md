# Quits — Build Plan

| | |
|---|---|
| Spec | [SPEC.md](SPEC.md) **v0.3**. If SPEC.md and this plan disagree, SPEC.md wins. |
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
   - Runtime: `next`, `react`, `react-dom`, `tailwindcss`, `@supabase/supabase-js`, `@google/genai`, `zod`, `qrcode`, `server-only`.
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
| 1.15 | Approve the §4.3 Frankfurter update (this becomes SPEC v0.4). | HUMAN | P1-7 |
| 1.16 | `/lab/upi`: a form (VPA, name, amount; nothing stored) that shows the `upi://pay` button and its QR code, built from `lib/upi.ts` (stub). | AUTO | R24 · P1-8 |
| 1.17 | On the Samsung phone, open the link in GPay, PhonePe and Paytm and record which apps fill in the amount. Scan the desktop QR code. | HUMAN | P1-8 |
| 1.18 | `manifest.webmanifest` and icons (192, 512, 512 maskable, apple 180) generated from `public/icon.svg` with `sharp`. | AUTO | R52 · P1-9 |
| 1.19 | Install the PWA from Chrome on Android, and confirm it opens standalone. | HUMAN | P1-9 |
| 1.20 | `npm run build`, then `grep -rE "sb_secret_\|AIza" .next/static` finds nothing. | AUTO | R54 · P1-10 |
| 1.21 | Once P1-6 is Pass, delete `/api/lab/extract` and `/lab/receipt`. Keep the compression helper in `app/_lib/compress.ts` for Phase 5. | AUTO | R30 |
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

**Goal:** the core loop works on a 360 px phone: create → share → pick identity → add expenses → settle with UPI.

| # | Task | Mode | Satisfies |
|---|---|---|---|
| 4.1 | App shell: centered ≤ 640 px column, bottom nav (Expenses · Settle · Activity · Group), "+" button, loading and error states, AA tokens, 44 px targets. | AUTO | R50, R51 |
| 4.2 | Landing and create-group form (name, base currency, ≥ 2 members); `/g/[token]` with 404. | AUTO | R1, R15 |
| 4.3 | Share screen: the access notice, copy link, `navigator.share`; group-link QR code (Should). | AUTO | R2, R3 |
| 4.4 | Member picker with `localStorage` identity, "I'm not on the list", Switch person; recent groups (Should). | AUTO | R4, R5 |
| 4.5 | Members screen: add, rename, UPI ID with validation; archive (Should). | AUTO | R6, R7 |
| 4.6 | Expense list (50 per page), add/edit form with the 4 split types, live difference, default-split prefill, Group settings default split; multi-payer UI (Should). | AUTO | R8, R9, R10 |
| 4.7 | Expense detail, edit, soft delete; activity screen; Restore (Should). | AUTO | R11, R12, R42 |
| 4.8 | Settle screen: balances in words, naive/greedy/optimal counts and algorithm label, suggestions, Mark as paid, manual settlement. | AUTO | R22, R23, R51 |
| 4.9 | UPI actions: Pay via UPI, QR code (shown by default ≥ 768 px), Copy UPI ID, no-UPI-ID and non-INR conditions, "Did the payment go through?" on `visibilitychange`; > ₹1 lakh warning (Should). Promote the `/lab/upi` code into this screen. | AUTO | R24–R26 |
| 4.10 | Offline fallback page via service worker (Should). | AUTO | R53 |
| 4.11 | Commit `feat(ui): ...`. | AUTO | — |
| 4.12 | Push, then on the deployment run AC-14, AC-15, AC-16, AC-27, AC-28, AC-29 and AC-30 (Should). | HUMAN | — |

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
| 7.1 | Collect 10–15 real receipts (restaurant, café, grocery, delivery screenshots), blur personal data, save as `eval/receipts/{id}.jpg`. | HUMAN | R37 |
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

---

## Proposed SPEC changes (awaiting approval)

These are wording changes only; the code already follows them. Approving them makes SPEC v0.4.

| ID | Where | Change | Why |
|---|---|---|---|
| SC-1 (task 1.15) | §4.3 Frankfurter v2 | **Request:** `GET https://api.frankfurter.dev/v2/rate/{BASE}/{QUOTE}?date=YYYY-MM-DD`.<br>**Response:** `{"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}`, where `rate` is a JSON number.<br>**Dates:** weekends and holidays return a blended rate for that same date; dates after today return 404, so those requests omit `date` and get the latest rate; an unknown currency returns 422. | Confirmed by probing in P1-7. D-17 still holds. |
| SC-2 | §3 Stack, Gemini | `responseSchema` → `responseJsonSchema` | In `@google/genai` 2.x, `responseJsonSchema` is the field that takes a plain JSON Schema. Same behaviour: structured JSON output. |
| SC-3 | R17 | "weighted by their original-currency amounts" → "weighted by their exact original-currency proportions: payer amounts, or the split's own weights (1 per person for equal, basis points, shares, or exact amounts)" | AC-6 expects an equal USD split to stay equal in INR (`[34329, 34329, 34328]`). Weighting by the *rounded* cent shares (412/411/411) would give `[34384, 34301, 34301]`. The code uses the exact proportions, which satisfies both AC-6 and the intent of R17. |

---

## AC status

Rows P1-1 to P1-10 are the Phase 1 checks; each one de-risks the spec ACs shown in brackets. Every other row is a SPEC AC.

| AC | Type | Phase | Status | Evidence |
|---|---|---|---|---|
| P1-1 Scaffold lint/test/build local [AC-45] | Script | 1 | Pass | `npm run lint` clean; `npm run typecheck` clean; `npm test` 1/1; `npm run build` OK (Next 16.4.2, React 19.3) |
| P1-2 CI green on ubuntu-24.04 [AC-45] | Deploy | 1 | Pending (human) | `ci.yml` written (lint, typecheck, unit tests); needs push (1.4) |
| P1-3 Vercel prod deploy from GitHub | Deploy | 1 | Pending (human) | needs Vercel import (1.5) |
| P1-4 `/api/health` via Supabase, RLS on [AC-41, AC-44] | Deploy | 1 | Pending (human) | local pass: `db:push` applied `_health` (RLS on); `next start` → `GET /api/health` = `{"ok":true}` 200; prod check after 1.5 |
| P1-5 Keep-alive `workflow_dispatch` green [AC-44] | Script | 1 | Pending (human) | `keepalive.yml` written; needs repo variable `APP_URL` + manual run (1.10) |
| P1-6 Phone photo < 1 MB → Gemini JSON [AC-20] | Phone | 1 | Pending (human) | server part local pass: synthetic bill → `gemini-3.5-flash-lite` JSON in 4.3 s, items/tax/service/total exact; fake JPEG → 415; phone test is 1.13 |
| P1-7 Frankfurter v2 historical + weekend USD→INR [AC-8] | Script | 1 | Pass | `GET /v2/rate/USD/INR?date=2026-10-01` → `{"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}`; Sunday 2026-10-04 → 96.19 (same date); future date → 404. SPEC wording awaits approval (SC-1, task 1.15) |
| P1-8 UPI link in GPay/PhonePe/Paytm + QR [AC-14, AC-15] | Phone | 1 | Pending (human) | `/lab/upi` ready (link, QR, copy UPI ID); phone test is 1.17 |
| P1-9 PWA installs on Android [AC-40] | Phone | 1 | Pending (human) | manifest + 4 icons served (200 locally); install test is 1.19 |
| P1-10 No secrets in `.next/static` [AC-42] | Script | 1 | Pass | `grep -rE "sb_secret_\|AIza" .next/static` → no matches |
| AC-1 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-1 (equal ₹100/3, 100 paise/7); tests/unit/money.test.ts › AC-1 |
| AC-2 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-2 (percent 999 → [499,250,250]; shares 1001 → [501,250,250]) |
| AC-3 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-3 (EXACT_MISMATCH diff 1; PERCENT_MISMATCH 99.99) |
| AC-4 | Unit | 2 | Pass | tests/unit/splits.test.ts › AC-4 (3 cases incl. multi-payer and soft delete) |
| AC-5 | Unit | 2 | Pass | tests/unit/invariants.test.ts › AC-5 (1,000 groups, >10,000 expenses, 5 split types, 5 currencies) |
| AC-6 | Unit | 2 | Pass | tests/unit/currency.test.ts › AC-6 (USD 102986 → [34329,34329,34328]; THB 2362; JPY 56120). See SC-3 |
| AC-7 | Unit | 2 | Pass | tests/unit/currency.test.ts › AC-7 (timeout → RATE_UNAVAILABLE; manual rate source = manual) |
| AC-8 | Deploy | 6 | Not run | |
| AC-9 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-9 (greedy 4 exact sequence; optimal 3 exact sequence; both zero balances) |
| AC-10 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-10 (naive 3, greedy 1, optimal 1) |
| AC-11 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-11 (edge cases; 300 random n ≤ 8 = brute force) |
| AC-12 | Unit | 2 | Pass | tests/unit/simplify.test.ts › AC-12 (18 balances well under 2 s; 19 → greedy/null; deterministic) |
| AC-13 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-13 (exact link string; UPI ID accept/reject list) |
| AC-14 | Phone | 4 | Not run | |
| AC-15 | Desktop + Phone | 4 | Not run | |
| AC-16 | Deploy | 4 | Not run | |
| AC-17 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-17 (diff 0 / +150; 100 not flagged, 101 flagged) |
| AC-18 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-18 (₹840 and ₹845 cases, shared ₹100 item, negative remainder) |
| AC-19 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-19 (12.5 → 1250; missing items / negative rejected; timeout → EXTRACT_FAILED) |
| AC-20 | Phone + Desktop | 5 | Not run | |
| AC-21 | Script | 5 | Not run | |
| AC-22 | Deploy | 5 | Not run | |
| AC-23 | Unit | 2 | Pass | tests/unit/receipt.test.ts › AC-23 (P 0.667, R 0.5, F1 0.571; Paneer Tikka match) |
| AC-24 | Script + Deploy | 7 | Not run | |
| AC-25 (Should) | Script | 7 | Not run | |
| AC-26 | Unit + Deploy | 2 / 7 | Partial | unit part Pass: tests/unit/misc.test.ts › AC-26 (10,000 unique tokens); 404 part is Deploy (Phase 3 route + human) |
| AC-27 | Desktop + Phone | 4 | Not run | |
| AC-28 | Deploy | 4 | Not run | |
| AC-29 | Deploy | 4 | Not run | |
| AC-30 (Should) | Deploy | 4 | Not run | |
| AC-31 | Deploy | 6 | Not run | |
| AC-32 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-32 (BOM + header, formula guard, RFC 4180, deleted rows absent) |
| AC-33 (Should) | Desktop | 6 | Not run | |
| AC-34 (Should) | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-34 (Jan 31 clamping; idempotent second call) |
| AC-35 (Should) | Deploy | 6 | Not run | |
| AC-36 | Unit | 2 | Pass | tests/unit/misc.test.ts › AC-36 (seed balances exact; greedy 4, optimal 3) |
| AC-37 | Desktop | 6 / 7 | Not run | |
| AC-38 | Deploy | 6 | Not run | |
| AC-39 | Phone + Desktop | 7 | Not run | |
| AC-40 (Should) | Phone | 7 | Not run | |
| AC-41 | Script | 3 / 7 | Not run | |
| AC-42 | Deploy + Script | 7 | Not run | |
| AC-43 | Script | 3 / 7 | Not run | |
| AC-44 | Script | 1 / 7 | Not run | |
| AC-45 | Script | 7 | Not run | |
