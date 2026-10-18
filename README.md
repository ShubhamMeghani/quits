# Quits

Split bills. Settle up. Call it quits.

- **Live app:** https://quits-go.vercel.app. No sign-up needed.
- **Demo for evaluators:** **https://quits-go.vercel.app/demo** opens a fresh sample group. On the home page it's the **Try a demo group →** link under "Start a group".

Quits is a free, mobile-first bill-splitting web app for Indian students, built as the course project for Applied Data Science & AI at IISc. It was built with spec-driven development: [SPEC.md](SPEC.md) states what to build, and [PLAN.md](PLAN.md) records how it was built and the evidence for every acceptance criterion.

## What it does

- **Groups by link, no accounts:** on each device you pick who you are once. Anyone with the link can view and edit the group.
- **"Your groups":** the home page lists the groups opened on this device, with your name in each, when you last opened it, and a Demo label. The list stays on the device only; nothing is sent to the server.
- **Expenses:**
  - four split types: equal, exact amounts, percentages and shares;
  - one or more payers;
  - categories (each with its own icon), notes and dates;
  - a default split per group;
  - 21 currencies, converted at that date's Frankfurter rate, which is stored on the expense.
- **Type to add:** type or dictate a sentence such as "Rohan paid 600 for pizza, split with Kabir and me" (English or Hinglish). Gemini fills in the form for you to check. Nothing is saved until you tap Save, and a name it can't match is left blank and highlighted.
- **Exact money:** amounts are stored as integer paise. Rounding leftovers go to the people with the largest remainders, so every group's balances sum to exactly 0.
- **Fewest payments:**
  - Settle says it in plain words, e.g. **"3 payments instead of 10"**, with a "Simplified" badge.
  - The plan is provably minimal: it uses dynamic programming over subsets for up to 18 people, and greedy above that.
  - **How?** shows the naive, greedy and optimal counts.
- **UPI QR settle-up:**
  - Every suggested payment has a UPI QR code with the payee and amount filled in.
  - You can scan it from a laptop screen, a friend's phone in full screen, or a saved image. It is always black on white, so it scans in both themes.
  - Quits never handles money: a payment is recorded only when you tap **Mark as paid**.
- **WhatsApp:** **Share summary** shares the settle-up plan, and **Remind** opens a polite reminder in WhatsApp. No phone numbers are stored.
- **Itemized receipts:**
  - Add a receipt by photo, camera, Ctrl+V paste or drag-and-drop. It's compressed in the browser to under 1 MB and read by Gemini (`gemini-3.5-flash-lite`).
  - Every value can be edited. Quits flags a mismatch when items + tax + charges differ from the printed total by more than ₹1.
  - Each person then taps what they had, and tax and charges are shared in proportion.
- **Also:**
  - search and stats, with charts per person and per category (with % of total);
  - an activity log with restore;
  - CSV export;
  - recurring expenses;
  - dark and light themes (Dark / Light / System on the Group screen);
  - installable as an app (PWA), with an **All groups** link back to the home page.

## Demo (for evaluators)

1. Open **https://quits-go.vercel.app/demo**. A fresh sample group opens: "Flat 302 · HSR Layout". Each visit makes a new copy, so evaluators never see each other's changes.
2. Pick a name, for example Aarav.
3. **Settle:** "3 payments instead of 10". Tap **How?** to see greedy 4 and optimal 3. Each payment has a UPI QR code; the demo's UPI IDs are fake.
4. **Expenses:**
   - "Goa trip — beach shack dinner" is an itemized receipt with a per-item breakdown.
   - "AI study tool subscription" was paid in USD and shows the rate used.
   - **+ → Add expense** has a **Type it** box that fills the form from a sentence.
5. **Group:**
   - **Search & stats:** try "swiggy".
   - **Recurring expenses:** shows the monthly Flat rent rule.
   - **Reset demo:** restores the sample data.
   - **Appearance:** switches the theme.
6. **About** explains how Quits works and shows both evaluations.

## How it is built

| Part | Choice |
|---|---|
| App | Next.js 16 (App Router, TypeScript), Tailwind CSS 4 with design tokens for both themes, Inter self-hosted via `next/font`, on Vercel |
| Data | Supabase Postgres. RLS is on for every table with **no policies**. The database is used only from server code with the secret key, so the browser never talks to Supabase. |
| AI | Gemini structured JSON output (receipts and type-to-add), called only from the server. Receipt images are never stored. |
| Exchange rates | Frankfurter v2 (`/v2/rate/{BASE}/{QUOTE}?date=`), cached in `fx_rates` |
| Core logic | Pure, unit-tested modules in `lib/`: `money`, `splits`, `simplify`, `receipt`, `nlparse`, `currency`, `upi`, `share`, `csv`, `recurring`, `demo-seed`, `recent-groups`, `stats`, `theme`, `avatar`, `category-style` |
| Writes | Each multi-table write is one Postgres function, so it is atomic. The functions re-check that every id belongs to the group and that payers = splits = total. |

## Run it locally

```bash
npm install
cp .env.example .env.local        # then fill in the values (never commit .env.local)
npm run db:push                   # applies supabase/migrations to your database
npm run dev                       # http://localhost:3000
```

**Environment variables** (names only):

| Name | Where | Notes |
|---|---|---|
| `SUPABASE_URL` | `.env.local`, Vercel | |
| `SUPABASE_SECRET_KEY` | `.env.local`, Vercel | secret |
| `GEMINI_API_KEY` | `.env.local`, Vercel | secret |
| `GEMINI_MODEL` | `.env.local`, Vercel | `gemini-3.5-flash-lite` |
| `SUPABASE_DB_URL` | `.env.local` only | Session pooler connection string (IPv4), for migrations and DB tests |
| `SCAN_LIMIT_PER_GROUP`, `SCAN_LIMIT_PER_APP` | optional | daily receipt scans per group (default 30) and AI calls for the whole app (default 300) |
| `NL_LIMIT_PER_GROUP` | optional | daily type-to-add calls per group (default 50) |
| `APP_URL` | GitHub repository variable | used by the daily keep-alive workflow |

**Deploy:** push to `main`, and Vercel builds and deploys it. GitHub Actions does two things:
- `ci.yml` runs lint, typecheck and unit tests on every push;
- `keepalive.yml` calls `/api/health` daily so the free Supabase project doesn't pause.

## Tests and evaluation

```bash
npm run lint && npm run typecheck
npm test                 # unit tests (Vitest): 162 tests
npm run test:db          # DB integration tests (24); needs SUPABASE_DB_URL, skipped otherwise
npm run test:db:clean    # removes leftover "__test__" groups
npm run build
npm run eval             # receipt eval on eval/receipts (see eval/README.md)
npm run eval:nl          # type-to-add eval on eval/nl (see eval/nl/README.md)
```

Both evals call Gemini. Every run is kept, never overwritten, and each run's report says what changed since the previous one and which results are not blind. The results are on the About page.

**Receipt eval** (`eval/REPORT.md`): **n = 5, small sample** (one receipt moves a per-receipt rate by 20 points). Five real receipts with ground truth checked by hand against the paper bills. The main result is run 3:

| | Overall | When answered |
|---|---|---|
| Answer rate (read within 25 s) | 80% (4 of 5) | — |
| Item F1 | 45.2% | 100% |
| Total accuracy | 80% | 100% |
| Reconciliation (items + tax + charges = total ± ₹1) | 80% | 100% |

Run 3 is not blind for r01 and r04: run 2 revealed two prompt gaps there, which were fixed. The low overall F1 comes from one receipt that timed out (all 34 of its items count as missed), not from misreads.

**Type-to-add eval** (`eval/nl/REPORT.md`): **n = 30, small sample**. Twenty sentences were written by Claude and ten by the human, all reviewed by the human; seven are deliberately ambiguous. The main result is run 3:

| | Overall | When answered |
|---|---|---|
| Answer rate (within 20 s) | 80% (24 of 30) | — |
| Amount | 76.7% | 95.8% |
| Exact match | 76.7% | 95.8% |

The 6 unanswered sentences were Gemini "high demand" errors (HTTP 503) or timeouts, not wrong answers.

**The `eval/synthetic/` run** only smoke-tests the script.

## UPI app results (AC-14, P1-8)

Tested on a Samsung phone against the deployed app, 2026-10-16:

| Path | GPay | PhonePe | Paytm |
|---|---|---|---|
| `upi://pay` link from a website ("Pay via UPI app") | blocked: misleading "exceeded bank limit" error at ₹1 | blocked | blocked |
| QR shown on a laptop, scanned by the phone | works: payee and ₹1.00 filled in | — | — |
| QR screenshot scanned from the gallery | works | — | — |

As a result, settle-up is QR-first (SPEC v0.5, D-18). The link is kept only as a best-effort option, labelled "May be blocked by some UPI apps". The 2026-10-19 production check confirmed the QR also scans in the dark theme: on screen, full screen and from the saved image.

## Acceptance status

**58 of 60 acceptance criteria pass**, all with evidence in [PLAN.md](PLAN.md) → "AC status": unit and DB tests, headless-browser checks, and live checks on production and on an Android phone. The two failures are Should-level accuracy targets:

| AC | Target | Result (n is small) | Why |
|---|---|---|---|
| AC-25 (Should) | receipt item F1 ≥ 0.80 and reconciliation ≥ 0.70 | F1 0.452, reconciliation 0.80 (run 3, n = 5) | One receipt timed out at 25 s, so all 34 of its items count as missed. When answered: F1 1.00, reconciliation 1.00. |
| AC-52 (Should) | type-to-add amount ≥ 95% and exact match ≥ 80% | 76.7% and 76.7% (run 3, n = 30) | Six sentences got no answer (Gemini 503 or timeouts). When answered: amount and exact match 95.8%. |

Both are reported as measured. Fixes driven by the evals are labelled in the reports, and the next run is marked not blind:
- **Receipts:** the add-on and fee rules (D-34) were product bugs that the evals revealed.
- **Type-to-add:** the 20 s limit and the retry delay (D-29).

Nothing was tuned just to raise a score.

## Spec-driven development: the files

| File | What it is |
|---|---|
| [SPEC.md](SPEC.md) | The specification, v1.7: goals and users, constraints, data model and interfaces, **73 requirements** in EARS form (49 Must, 24 Should), **60 pass/fail acceptance criteria**, deliverables, non-goals, risks, decisions D-1 to D-41, and a changelog from v0.1 to v1.7. When the code and the spec disagreed, the spec was changed first and logged. |
| [PLAN.md](PLAN.md) | The build plan: phases 1–12 with tasks mapped to requirements and ACs (AUTO / HUMAN), the build log, SPEC change proposals, and the **AC status table**, with evidence for every criterion. |
| [eval/README.md](eval/README.md), [eval/nl/README.md](eval/nl/README.md) | How the two evaluations work, their ground-truth rules, and every kept run (`REPORT*.md`, `results*.json`). |
| `AGENTS.md`, `.claude/settings.json` | Instructions and settings for the coding agent (Claude Code). |

## Known limitations

- **No accounts:** anyone with a group link can view and edit everything. The identity you pick on a device is not a login.
- **"Your groups" is per device:** it isn't synced, and clearing browser data clears it. The groups themselves are unaffected.
- **Concurrent edits: last write wins.** There is no conflict detection. The activity log shows every change, and deletions can be restored.
- **No real-time updates:** other people's changes appear when you refresh or navigate.
- **Recurring rules** are created lazily when someone opens the group. They can be paused, resumed or stopped, but not edited (SPEC D-20; R46 partially met).
- **Itemized expenses** can't be edited after finalizing. Delete the expense and scan the receipt again (SPEC D-19). Every value is editable before finalizing.
- **Resetting the demo** re-creates its members, so each device picks its name again.
- **Gemini (receipts and type-to-add)** runs on the free tier:
  - there are daily limits;
  - at busy times it answers "high demand" (HTTP 503) or slowly, and Quits then shows **Try again**;
  - photos and sentences are sent to Google, but Quits doesn't store them.
- **The evaluations are small samples** (n = 5 receipts, n = 30 sentences), so one item moves a rate a lot. They are honest measurements, not benchmarks.
- **The UPI deep link** is blocked by major UPI apps when opened from a website. Use the QR code.
- **Type-to-add with no payer named:** when a sentence doesn't say who paid (e.g. "paid for the movie", eval sentence human-06), the model may assume the speaker paid instead of leaving the payer blank. The prompt was deliberately not tuned for this, to keep the eval honest. Always check "Paid by" before saving.
