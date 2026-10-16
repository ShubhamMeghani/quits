# Quits

Split bills. Settle up. Call it quits.

**Live app:** https://quits-go.vercel.app — tap **Try the demo**. No sign-up is needed.

Quits is a free, mobile-first bill-splitting web app for Indian students. It's the course project for Applied Data Science & AI at IISc.

- [SPEC.md](SPEC.md): the specification (requirements R1–R60, acceptance criteria AC-1–AC-46).
- [PLAN.md](PLAN.md): the build plan and the status of every acceptance criterion, with evidence.

## What it does

- **Groups by link:** no accounts. On each device you pick who you are once. Anyone with the link can view and edit the group.
- **Expenses:**
  - four split types: equal, exact amounts, percentages and shares;
  - one or more payers;
  - categories, notes and dates;
  - a default split per group;
  - expenses in any of 21 currencies, converted at that date's Frankfurter rate, which is stored on the expense.
- **Exact money:** amounts are stored as integer paise. Rounding leftovers go to the people with the largest remainders, so every group's balances always sum to exactly 0.
- **Fewest payments:** settle-up computes the provably minimum number of payments, using dynamic programming over subsets for up to 18 people (greedy above that). It shows the optimal, greedy and naive counts side by side.
- **UPI QR settle-up:** every suggested payment has a UPI QR code with the payee and amount filled in. You can scan it from a laptop screen, a friend's phone in full screen, or a saved image. "Copy UPI ID" shows the amount in large text. Quits never handles money: a payment is recorded only when you tap **Mark as paid**.
- **Itemized receipts:** add a receipt by photo, camera, Ctrl+V paste or drag-and-drop. It is compressed in the browser to under 1 MB and read by Gemini (`gemini-3.5-flash-lite`). Every value can be edited, and Quits flags a mismatch when items + tax + charges ≠ the printed total by more than ₹1. Then each person taps what they had, and tax and charges are shared in proportion.
- **Also:**
  - search and stats (charts per person and per category);
  - an activity log with restore;
  - CSV export;
  - recurring expenses;
  - a one-tap demo;
  - installable as an app (PWA).

## Demo (for evaluators)

1. Open https://quits-go.vercel.app and tap **Try the demo**. A fresh sample group opens: "Flat 302 · HSR Layout".
2. Pick a name, for example Aarav.
3. **Settle:** the exact plan needs **3** payments, where greedy needs 4. Each payment has a UPI QR code; the demo's UPI IDs are fake.
4. **Expenses:** "Goa trip — beach shack dinner" is an itemized receipt with a per-item breakdown. "AI study tool subscription" was paid in USD and shows the rate used.
5. **Group → Search & stats:** try "swiggy". **Group → Reset demo** restores the sample data.
6. **About** explains how Quits works and shows the receipt-reading accuracy.

## How it is built

| Part | Choice |
|---|---|
| App | Next.js 16 (App Router, TypeScript), Tailwind CSS 4, on Vercel |
| Data | Supabase Postgres. RLS is on for every table with **no policies**; the database is used only from server code with the secret key, so the browser never talks to Supabase. |
| Receipts | Gemini structured JSON output, called only from the server. The receipt image is never stored. |
| Exchange rates | Frankfurter v2 (`/v2/rate/{BASE}/{QUOTE}?date=`), cached in `fx_rates` |
| Core logic | Pure, tested modules: `lib/money.ts`, `lib/splits.ts`, `lib/simplify.ts`, `lib/receipt.ts`, `lib/currency.ts`, `lib/upi.ts`, `lib/csv.ts`, `lib/recurring.ts`, `lib/demo-seed.ts` |
| Writes | Each multi-table write is one Postgres function (atomic). The functions re-check that every id belongs to the group and that payers = splits = total. |

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
| `SCAN_LIMIT_PER_GROUP`, `SCAN_LIMIT_PER_APP` | optional | default 30 and 300 receipt scans per day |
| `APP_URL` | GitHub repository variable | used by the daily keep-alive workflow |

**Deploy:** push to `main` and Vercel builds and deploys it. GitHub Actions runs lint, typecheck and unit tests on every push (`ci.yml`). It also calls `/api/health` daily (`keepalive.yml`) so the free Supabase project doesn't pause.

## Tests and evaluation

```bash
npm run lint && npm run typecheck
npm test                 # unit tests (Vitest)
npm run test:db          # DB integration tests; needs SUPABASE_DB_URL, skipped otherwise
npm run test:db:clean    # removes leftover "__test__" groups
npm run build
npm run eval             # receipt-extraction eval on eval/receipts (see eval/README.md)
```

**Receipt eval:** precision, recall, F1, total accuracy and reconciliation rate are measured on 10–15 hand-labelled real receipts, and the results appear on the About page. The `eval/synthetic/` run is only a smoke test of the script.

## UPI app results (AC-14, P1-8)

Tested on a Samsung phone against the deployed app, 2026-10-16:

| Path | GPay | PhonePe | Paytm |
|---|---|---|---|
| `upi://pay` link from a website ("Pay via UPI app") | blocked: misleading "exceeded bank limit" error at ₹1 | blocked | blocked |
| QR shown on a laptop, scanned by the phone | works: payee and ₹1.00 filled in | — | — |
| QR screenshot scanned from the gallery | works | — | — |

As a result, settle-up is QR-first (SPEC v0.5, D-18). The link is kept only as a best-effort option, labelled "May be blocked by some UPI apps".

## Known limitations

- **No accounts:** anyone with a group link can view and edit everything. The identity you pick on a device is not a login.
- **Concurrent edits: last write wins.** There is no conflict detection; the activity log shows every change and deletions can be restored.
- **No real-time updates:** other people's changes appear when you refresh or navigate.
- **Recurring rules** are created lazily when someone opens the group, and can be paused, resumed or stopped but not edited.
- **Resetting the demo** re-creates its members, so each device picks its name again.
- **Receipt reading** depends on Gemini's free tier: there is a daily scan limit, and the photo is sent to Google but not stored by Quits.
- **The UPI deep link** is blocked by major UPI apps when opened from a website; use the QR code.
