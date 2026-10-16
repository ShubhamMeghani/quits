# Quits — Specification

> Split bills. Settle up. Call it quits.

| | |
|---|---|
| Version | v0.6 |
| Date | 2026-10-16 |
| Status | Ready for build. All open questions are decided (§10.1). Build order is in `PLAN.md`. |
| Course | Applied Data Science & AI, IISc |
| Build budget | About 3 days with Claude Code |

**Must** = required for a working, defensible demo. **Should** = build only if time allows; cut in the order given in §9 (K11).

---

## 1. Goal

Quits is a free, mobile-first web app for Indian students to track shared expenses, see who owes whom, and settle up over UPI. Groups work from a share link with no sign-up. Restaurant bills are read by an LLM and split item by item. Debts are settled with the **provably minimum** number of payments.

**Comparison**
- **Splitwise (free tier):** about 3–4 new expenses per day, a 10-second cooldown, and ads. Splitwise Pro (₹149/month or ₹999/year in India) unlocks:
  - unlimited expenses;
  - receipt scanning;
  - currency conversion;
  - expense search;
  - custom default splits.
- **Spliit:** a free, open-source web app.
- **Tricount:** a free app with groups shared by link.

**Quits' edge:** everything Splitwise Pro unlocks is free in Quits, with no caps. On top of that, Quits offers:
- **UPI QR settle-up with the amount prefilled:** each suggested payment has a UPI QR code with the payee and amount filled in. You can scan it from a laptop screen, from a friend's phone in full screen, or as a saved image from the gallery in any UPI app. You then tap "Mark as paid".
- **Itemized receipt splitting:** each person taps what they had; tax and tips are split in proportion.
- **Provably optimal debt simplification:** the payment count is shown next to greedy and naive counts.
- **Measured receipt accuracy:** precision, recall and reconciliation rate on a labelled test set, published in the app.

## 2. Users and main scenarios

**Users**
- **U1 Flatmates** (3–6 people): rent, Wi-Fi, electricity, groceries, food delivery.
- **U2 Trip group** (3–10 people): a Goa trip, sometimes abroad in a foreign currency.
- **U3 Hostel friends**: frequent small food orders and shared restaurant bills.
- **U4 Evaluator** (the professor), on a desktop browser: opens the deployed URL and uses the demo.

**Scenarios**
- **S1 Create and share.** A student creates a group with members' names and shares the link on WhatsApp. Friends open it and pick their own name.
- **S2 Add an expense.** "Swiggy ₹1,240, paid by Priya, split equally among 4" takes ≤ 15 seconds on a phone.
- **S3 Itemized bill.** One phone photographs the bill. Gemini extracts the items, and the phone is passed around so each person taps what they had. Tax and service charge are split in proportion.
- **S4 Settle up.** Settle shows the minimum set of payments, each with a UPI QR code that has the amount filled in. The payer scans it with any UPI app: from the laptop screen, from a friend's phone in full screen, or as a saved QR image from the gallery. After paying, they tap "Mark as paid", and only then is the payment recorded.
- **S5 Foreign trip.** A THB expense is converted to INR at the rate for the expense date, and that rate is stored.
- **S6 Recurring rent.** Monthly rent appears automatically the next time the group is opened after its due date.
- **S7 Evaluator demo.** On desktop: "Try the demo" opens realistic data. Settle shows optimal fewer payments than greedy, a UPI QR code is visible, there is an itemized receipt, and the About page shows the eval metrics.

## 3. Constraints

**Stack (fixed)**
- Next.js (App Router, TypeScript), Tailwind CSS, Vercel Hobby.
- Supabase Postgres (its own free project).
- **Gemini:** model `gemini-3.5-flash-lite` (env var `GEMINI_MODEL`), with structured JSON output (`responseMimeType: application/json` + `responseJsonSchema`). Server only.
- **Frankfurter v2 API** (free, no key; v1 is superseded). The endpoint and response shape were confirmed in Phase 1 (§4.3) and are wrapped in one adapter in `lib/currency.ts` (risk K6).
- Vitest for unit tests.
- **Pure, UI-free core modules** (no React, Next.js, Supabase or `fetch` imports; I/O is injected):

  | Module | Contents |
  |---|---|
  | `lib/money.ts` | minor units, formatting, largest-remainder allocation |
  | `lib/splits.ts` | splits, balances |
  | `lib/simplify.ts` | naive, greedy, optimal |
  | `lib/receipt.ts` | schema, reconciliation, itemized allocation, eval metrics |
  | `lib/currency.ts` | exponents, conversion, Frankfurter parsing |
  | Also allowed | `lib/upi.ts`, `lib/recurring.ts`, `lib/csv.ts`, `lib/demo-seed.ts` |

**Security**
- RLS is enabled on **every** table with **no policies**.
- The database is accessed **only** from server code (Route Handlers / Server Actions), using the Supabase **secret key** from a module marked `import "server-only"`. The browser never talks to Supabase or Gemini.
- **Access model, stated plainly:** anyone with a group's link can view and edit everything in that group. There are no accounts, and the chosen member identity is self-declared, not authentication.
- **Concurrent edits: last write wins.** There is no conflict detection.
- Every server operation resolves the group from the URL token and rejects IDs that do not belong to it.

**Secrets**
- Secrets live only in `.env.local` (gitignored) and in Vercel env vars. `.env.example` lists names only.
- **Secret names:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, and `SUPABASE_DB_URL`. `SUPABASE_DB_URL` is local only and is used just to apply migrations; it is never set in Vercel.
- **Non-secret config:**
  - `GEMINI_MODEL`.
  - `SCAN_LIMIT_PER_GROUP` and `SCAN_LIMIT_PER_APP` (optional; defaults 30 and 300).
  - The GitHub repository variable `APP_URL`, used by the keep-alive.
- No `NEXT_PUBLIC_*` variable holds a secret.
- Keys are never pasted into chat, code or commits.

**Free-tier and size limits**

| Limit | Value / handling |
|---|---|
| Receipt upload | ≤ 1,000,000 bytes after browser compression. The server rejects > 1,048,576 bytes. Sent as binary `multipart/form-data`. |
| Vercel body / duration | 4.5 MB body limit (well above the 1 MB cap). The extract route sets `maxDuration = 60`; Gemini timeout 25 s. |
| Supabase free | 500 MB. Pauses after ~7 days idle; handled by the GitHub Action keep-alive (R57). |
| Gemini free tier | Limited requests per minute and per day; handled by app rate limits (R30). Inputs may be used by Google; handled by the notice (R31). |
| Frankfurter | Rates cached in `fx_rates`. Fetch timeout 5 s. |
| Sizes | ≤ 50 members per group. Description ≤ 100 chars, notes ≤ 500, member name ≤ 30, group name ≤ 60. Amount ≤ 10,000,000 major units. |

**Conventions**
- **Dates:** IST (`Asia/Kolkata`) calendar dates, `YYYY-MM-DD`.
- **Display:** `en-IN` formatting (`₹1,23,456.78`).
- **Balance sign:** positive = the group owes this member; negative = the member owes.
- **Member order:** each member has a `display_order` (order of addition). **Every tie-break uses `display_order` ascending, then `id`.**

## 4. Inputs and outputs

### 4.1 Data model (Postgres; all money columns are `bigint` minor units)

| Table | Key columns | Notes |
|---|---|---|
| `groups` | `id uuid pk`, `share_token text unique`, `name`, `base_currency char(3)` default `INR`, `default_split jsonb`, `is_demo bool`, `created_at`, `updated_at` | `default_split = {type, participants[], weights{}}` |
| `members` | `id`, `group_id`, `name`, `upi_id null`, `upi_name null` (payee name from their UPI QR, R60), `display_order int`, `archived_at null`, `created_at` | unique `(group_id, lower(name))` |
| `expenses` | `id`, `group_id`, `description`, `category`, `notes`, `expense_date`, `currency`, `amount_minor`, `fx_rate numeric(20,10)`, `fx_rate_date`, `fx_source` (`identity`\|`frankfurter`\|`manual`), `base_amount_minor`, `split_type` (`equal`\|`exact`\|`percent`\|`shares`\|`itemized`), `receipt_id null`, `recurring_rule_id null`, `recurring_occurrence null`, `created_by_member_id null`, `created_at`, `updated_at`, `deleted_at null` | unique `(recurring_rule_id, recurring_occurrence)` |
| `expense_payers` | `expense_id`, `member_id`, `amount_minor`, `base_amount_minor` | pk both IDs; Σ = expense totals |
| `expense_splits` | `expense_id`, `member_id`, `input_value numeric null`, `owed_minor`, `owed_base_minor` | `input_value` holds exact minor units, basis points, or a share count; Σ = expense totals |
| `settlements` | `id`, `group_id`, `from_member_id`, `to_member_id`, `amount_minor` (base), `settled_on`, `method` (`upi`\|`cash`\|`other`), `note`, `created_by_member_id`, `created_at`, `deleted_at null` | `from ≠ to`, `amount > 0` |
| `receipts` | `id`, `group_id`, `expense_id null`, `status` (`draft`\|`finalized`), `model`, `extracted jsonb`, `merchant`, `receipt_date`, `currency`, `tax_minor`, `service_minor`, `tip_minor`, `discount_minor`, `round_off_minor`, `printed_total_minor`, `diff_minor`, `created_at` | the image is **not stored** (D-2) |
| `receipt_items` | `id`, `receipt_id`, `position`, `name`, `quantity`, `amount_minor` | line total |
| `receipt_item_assignees` | `item_id`, `member_id` | pk both |
| `activity` | `id`, `group_id`, `actor_member_id null` (null = System), `action`, `entity_type`, `entity_id`, `summary`, `details jsonb`, `created_at` | append-only |
| `recurring_rules` | `id`, `group_id`, `template jsonb`, `frequency` (`weekly`\|`monthly`), `anchor_date`, `next_due`, `end_date null`, `active`, `created_by_member_id` | Should |
| `fx_rates` | `rate_date`, `base`, `quote`, `rate`, `source_date`, `fetched_at` | pk `(rate_date, base, quote)` |
| `rate_limits` | `bucket`, `window_start`, `count` | receipt scans |

Multi-table writes run in **one Postgres function (RPC)** each, so they are atomic. This covers an expense with its payers and splits, receipt finalize, demo create, and demo reset.

`action` values: `expense.created|updated|deleted|restored`, `settlement.created|updated|deleted|restored`, `member.added|updated|archived`, `group.updated`, `recurring.created|updated|deleted|generated`, `receipt.finalized`, `demo.reset`.

### 4.2 Server operations

| Operation | Input | Output |
|---|---|---|
| Create group | name, base currency, member names | `{ token }` → `/g/{token}` |
| Group read | token | group, members, expenses (pages of 50), balances, suggestions (materializes due recurring expenses first) |
| Expense / settlement create, update, delete (+ restore, Should) | token, payload | entity or validation error |
| Receipt extract | token, multipart image ≤ 1 MB | `ReceiptExtraction` (minor units) + reconciliation diff |
| Receipt finalize | token, edited receipt, assignments, payer(s) | created expense |
| CSV export | token | `text/csv` |
| Demo create / reset | — / token | `{ token }` |
| Health | `GET /api/health` | `{ "ok": true }` after one trivial DB query, or 503 |

### 4.3 External interfaces

**Gemini** (server only)
- **Input:** a compressed JPEG sent as inline data, a fixed extraction prompt, and a `responseJsonSchema`.
- **Output:** amounts in **major units as printed**. The server converts them to minor units with half-up rounding.

```json
{
  "merchant": "string | null",
  "date": "YYYY-MM-DD | null",
  "currency": "ISO-4217 | null",
  "items": [{ "name": "string", "quantity": "number", "amount": "number (line total)" }],
  "tax": "number", "service_charge": "number", "tip": "number",
  "discount": "number", "round_off": "number", "total": "number"
}
```

Missing extras are `0`. `tax` is the sum of all tax lines (CGST + SGST, VAT, etc.).

**Frankfurter v2**
- **Request:** `GET https://api.frankfurter.dev/v2/rate/{BASE}/{QUOTE}?date=YYYY-MM-DD` (confirmed in Phase 1, P1-7).
- **Response:** `{"date":"2026-10-01","base":"USD","quote":"INR","rate":95.98}`, where `rate` is a JSON number.
- **Dates:**
  - Weekends and holidays return a blended rate for that same date.
  - Dates after today return 404, so those requests omit `date` and get the latest rate (D-17).
  - An unknown currency returns 422.
- **Required parsed output:** `{ rate: string, sourceDate: YYYY-MM-DD }`. `sourceDate` may be earlier than the requested date (weekends and holidays); it is stored as `fx_rate_date`.
- **Supported currencies:** a static list in `lib/currency.ts`, taken from Frankfurter's currency list.
- **ISO 4217 exponents:** JPY, KRW and ISK use 0; all other supported currencies use 2.

**UPI deep link (output)**
```
upi://pay?pa={vpa}&pn={name}&am={rupees, 2 decimals}&cu=INR&tn={note}
```
- `pn` and `tn` are encoded with `encodeURIComponent`.
- `@` in `pa` stays literal.
- `tn = "Quits: {group name}"`, truncated to 50 characters.
- `pn` is the payee's `upi_name` if set (R60); otherwise it is their member name.
- **Use:** the settle-up QR code encodes this exact string, and the QR is the primary path (R24). The best-effort "Pay via UPI" button (R59) opens the same string.

## 5. Requirements

Requirement IDs are stable. R59 and R60 were added in v0.5 and sit in their topic sections (5.7 and 5.2).

### 5.1 Groups and identity
- **R1 [Must]** WHEN a user submits the create-group form with a name (1–60 chars), a base currency, and ≥ 2 distinct member names, THE SYSTEM SHALL create the group and open `/g/{token}`.
  - The share token SHALL come from a CSPRNG with ≥ 128 bits, encoded as base64url (≥ 22 chars).
  - THE SYSTEM SHALL NOT expose any operation that lists groups or tokens.
  - IF a token is malformed or unknown, THEN THE SYSTEM SHALL return the same generic 404 "Group not found" page in both cases.
- **R2 [Must]** WHEN the share screen is shown, including right after a group is created, THE SYSTEM SHALL display three things:
  - the text "Anyone with this link can view and edit this group.";
  - a "Copy link" button;
  - the native share sheet, where `navigator.share` exists.
- **R3 [Should]** WHEN the share screen is shown, THE SYSTEM SHALL display a QR code of the group link.
- **R4 [Must]** The member identity works as follows:
  - WHEN a group link is opened on a device with no remembered identity for that group, THE SYSTEM SHALL show the member picker before any group content. The picker lists active members plus "I'm not on the list", which adds a member.
  - WHEN a member is picked, THE SYSTEM SHALL store that member's ID in `localStorage`, keyed by token. It SHALL label that member "You" and record them as the actor of this device's changes.
  - WHEN "Switch person" is tapped, THE SYSTEM SHALL clear the stored identity and show the picker.
- **R5 [Should]** THE SYSTEM SHALL list groups opened on this device on the home screen.

### 5.2 Members
- **R6 [Must]** WHEN a user adds or renames a member, or sets a member's optional UPI ID, THE SYSTEM SHALL save it.
  - IF the name is outside 1–30 chars or equals another member's name in the group (case-insensitive), THEN THE SYSTEM SHALL reject it with "Name already used" or a length message.
  - IF the UPI ID does not match `^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$`, THEN THE SYSTEM SHALL reject it with "Invalid UPI ID".
- **R7 [Should]** WHEN a user archives a member whose balance is 0, THE SYSTEM SHALL hide them from pickers and new splits and keep them in history. IF the balance is nonzero, THEN THE SYSTEM SHALL refuse with "Settle up first".
- **R60 [Should]** WHEN a member uploads a screenshot of their own UPI QR code, THE SYSTEM SHALL decode it in the browser and fill in their UPI ID (`pa`) and UPI name (`pn`).
  - Only the UPI ID and the name are saved. The image is never uploaded or stored.
  - IF the image contains no valid UPI QR code, THEN THE SYSTEM SHALL show "No UPI QR code found" and save nothing.

### 5.3 Expenses and splits
- **R8 [Must]** WHEN a user saves an expense, THE SYSTEM SHALL validate it and atomically persist the expense, its payers and its splits.
  - **Fields:** description (1–100), amount (> 0, ≤ 10,000,000 major units), currency, date, category, payer, split, optional notes (≤ 500).
  - **Category:** one of Food & Drinks, Groceries, Rent, Utilities, Travel, Transport, Entertainment, Shopping, Health, Education, Other. The default is Other.
  - **Payer:** one payer, defaulting to "You". The data model and `lib/splits.ts` SHALL support multiple payers per expense.
  - **Limits:** there SHALL be no limit on the number of expenses. Lists load 50 at a time, newest `expense_date` first.
- **R9 [Must]** THE SYSTEM SHALL support four split types, each allocated with R13:
  - **equal** among the selected participants (≥ 1);
  - **exact** amounts;
  - **percent**, up to 2 decimals;
  - **shares**, non-negative integers with a total > 0.

  IF exact amounts do not sum exactly to the total, or percentages do not sum to exactly 100.00, THEN THE SYSTEM SHALL block saving and show the difference (e.g. "₹0.01 left to assign").

  WHEN the Add-expense form opens, THE SYSTEM SHALL pre-fill it with the group's default split (type, participants, weights). The default split is set in Group settings; if unset, it is equal among all active members.
- **R10 [Should]** WHEN the user selects more than one payer, THE SYSTEM SHALL require an amount for each. IF those amounts do not sum exactly to the total, THEN THE SYSTEM SHALL block saving and show the difference.
- **R11 [Must]** WHEN a user edits or deletes an expense or a settlement, THE SYSTEM SHALL:
  1. Persist the change. Edits follow last write wins.
  2. Recompute balances.
  3. Log an activity entry. Edit entries include before and after values.

  Deletion SHALL be a soft delete (`deleted_at`). The deleted row is excluded from balances, suggestions, search, charts and CSV.
- **R12 [Should]** WHEN a user taps Restore on a deletion entry in the activity log, THE SYSTEM SHALL clear `deleted_at` and log `*.restored`.

### 5.4 Money and balances
- **R13 [Must]** THE SYSTEM SHALL store and compute all money as integer minor units. Split, balance, simplification and allocation math SHALL use no floating-point; currency conversion uses scaled `BigInt`.

  Every allocation of an integer total across weights uses the **largest-remainder method**:
  1. Give each member `floor(total × wᵢ / Σw)`.
  2. Hand out the leftover units one at a time to the members with the largest fractional remainders.
  3. Break ties by member order (§3).

  Splits, converted payer and split amounts, receipt allocation, and the naive count all use this rule.
- **R14 [Must]** THE SYSTEM SHALL compute each member's balance in base minor units over non-deleted rows: `Σ paid_base − Σ owed_base + Σ settlements sent − Σ settlements received`.

  It SHALL maintain two invariants:
  - per expense, Σ payers = Σ splits = the total, in both the original and the base currency;
  - per group, Σ of all balances = 0.

  IF a write would break either invariant, THEN THE SYSTEM SHALL reject it and log a server error.

### 5.5 Multi-currency
- **R15 [Must]** WHEN a group is created, THE SYSTEM SHALL set its base currency from the supported list (default INR).
  - IF a base-currency change is attempted after the group has ≥ 1 expense, THEN THE SYSTEM SHALL reject it.
  - WHEN an expense is in the base currency, THE SYSTEM SHALL set `fx_rate = 1` and `fx_source = identity`, and make no rate call.
- **R16 [Must]** WHEN an expense is saved in a currency other than the base, THE SYSTEM SHALL use the rate for `expense_date`:
  - It takes the rate from `fx_rates`, or else fetches it from Frankfurter v2 and caches it.
  - It stores `fx_rate`, `fx_rate_date` and `fx_source = frankfurter`.
  - WHEN such an expense is edited, it SHALL re-fetch only if the date or currency changed.
  - The expense SHALL display its original amount, its base equivalent, and the rate with the rate date.
- **R17 [Must]** THE SYSTEM SHALL convert an amount as `base_amount_minor = round_half_up(amount_minor × rate × 10^(exp_base − exp_src))`, using exact decimal arithmetic. It SHALL then derive the base amounts of each payer and split by allocating `base_amount_minor` with R13, weighted by their exact original-currency proportions: payer amounts for payers, and for splits the split's own weights (1 per person for equal, basis points for percent, shares for shares, the amounts for exact and itemized), not the rounded minor-unit shares. An equal split therefore stays equal in the base currency, within 1 minor unit (AC-6).
- **R18 [Must]** IF the rate fetch fails or times out (5 s) and no cached rate exists, THEN THE SYSTEM SHALL ask for a manual rate (> 0, ≤ 10 decimals) and store it with `fx_source = manual`.

### 5.6 Debt simplification
- **R19 [Must]** THE SYSTEM SHALL compute suggested payments from current balances, over the `n` members whose balance is nonzero.
  - **WHEN `n ≤ 18`:** THE SYSTEM SHALL find the **exact minimum**, `n − k`, where `k` is the maximum number of disjoint zero-sum subsets.
    1. Use bitmask DP: precompute `sum[mask]`, then `dp[mask] = max over i∈mask of dp[mask∖{i}] + (sum[mask] = 0 ? 1 : 0)`. Members are indexed by member order.
    2. Recover the partition deterministically: scan masks in ascending order and `i` in ascending index.
    3. Order the subsets by their earliest member.
    4. Settle each subset of size `m` with `m − 1` payments, using greedy (R20) inside the subset.
  - **WHEN `n > 18`:** THE SYSTEM SHALL use greedy (R20) for the whole group and label the result "Greedy (approximate)".
  - In both cases, every suggested amount is > 0, applying all suggestions zeroes every balance, and the same balances and member order always give identical output.
- **R20 [Must]** THE SYSTEM SHALL compute **greedy** exactly as follows:
  1. Copy the balances. Repeat while any balance is nonzero.
  2. Pick the **debtor** with the most negative balance, breaking ties by member order.
  3. Pick the **creditor** with the most positive balance, breaking ties by member order.
  4. Emit the payment debtor → creditor of `x = min(|debtor|, creditor)`. Add `x` to the debtor's balance and subtract `x` from the creditor's.
  5. Output the payments in the order they were emitted.
- **R21 [Must]** THE SYSTEM SHALL compute the **naive** count as follows:
  1. For each non-deleted expense, each participant owes each payer `j` the amount `owed × paid_j / total`, allocated with R13.
  2. Each settlement reduces the amount between its two members.
  3. Naive = the number of unordered member pairs whose net amount is nonzero.
- **R22 [Must]** WHEN the Settle screen is shown, THE SYSTEM SHALL display the naive, greedy and optimal payment counts, plus the name of the algorithm that produced the listed payments. When `n > 18`, optimal is shown as "not computed (> 18 people)".

### 5.7 Settlements and UPI
- **R23 [Must]** THE SYSTEM SHALL record settlements in two ways, each updating balances and logging `settlement.created`:
  - WHEN a user taps "Mark as paid" on a suggestion and confirms, it creates a settlement for that amount (editable, > 0).
  - WHEN a user enters a manual settlement (from, to, amount, date, method), it creates that settlement.
- **R24 [Must]** WHEN the group's base currency is INR and the payee has a UPI ID, THE SYSTEM SHALL show a **QR-first** settle-up for each suggested payment (D-18):
  - a **UPI QR code** of the §4.3 link, with the payee and amount filled in (≥ 200 × 200 px), visible by default at every width;
  - on phones, **"Save QR image"**, which saves a PNG of the QR labelled with the payee and amount, so any UPI app can scan it from the gallery;
  - **"Show full screen"**, which enlarges the QR to fill the screen so a friend can scan it from this phone;
  - **"Copy UPI ID"**, which copies the payee's UPI ID and confirms "Copied", with the amount shown in large text next to it for manual entry.
- **R25 [Must]** THE SYSTEM SHALL NOT process, receive or verify payments.
  - It SHALL never record a settlement automatically. Showing, saving, scanning or opening a UPI link records nothing; a payment is recorded only WHEN the user taps "Mark as paid" and confirms (R23).
  - IF the payee has no UPI ID, THEN THE SYSTEM SHALL show "Add a UPI ID for {name}" in place of the UPI actions.
  - IF the base currency is not INR, THEN THE SYSTEM SHALL hide the UPI actions and keep "Mark as paid".
- **R26 [Should]** IF a suggested UPI amount exceeds ₹1,00,000, THEN THE SYSTEM SHALL warn that UPI apps may limit single payments.
- **R59 [Should]** WHEN UPI actions are shown (R24), THE SYSTEM SHALL also show a best-effort "Pay via UPI" button that opens the same §4.3 link. The button is labelled "May be blocked by some UPI apps". Opening it records nothing (R25).

### 5.8 Receipt scanning and itemized split
- **R27 [Must]** WHEN the user opens Scan receipt, THE SYSTEM SHALL accept an image in three ways:
  - a file picker (JPEG, PNG or WebP);
  - camera capture on phones (`capture="environment"`);
  - pasting an image from the clipboard (Ctrl/Cmd+V) anywhere on the scan screen.
- **R28 [Should]** WHEN an image file is dragged onto the scan screen, THE SYSTEM SHALL accept it like a picked file.
- **R29 [Must]** WHEN an image is chosen, THE SYSTEM SHALL compress it in the browser to JPEG ≤ 1,000,000 bytes:
  1. Scale the longest edge to ≤ 2000 px.
  2. Lower the quality from 0.85 down to 0.5.
  3. Then shrink the dimensions further.

  IF the image cannot be decoded or brought under the limit, THEN THE SYSTEM SHALL show an error and not upload.
- **R30 [Must]** THE SYSTEM SHALL reject the following receipt requests **without calling Gemini**:
  - IF the file is > 1,048,576 bytes, THEN reply 413.
  - IF its magic bytes are not JPEG, PNG or WebP, THEN reply 415.
  - IF the group has made more than 30 extract calls today (IST), or the whole app more than 300 (set by `SCAN_LIMIT_PER_GROUP` and `SCAN_LIMIT_PER_APP`), THEN reply 429 with "Daily scan limit reached — enter items manually".
- **R31 [Must]** WHEN a valid image is received, THE SYSTEM SHALL:
  1. Call Gemini with the §4.3 schema as `responseJsonSchema`.
  2. Validate the response with zod: all amounts ≥ 0 except `round_off`, and at least the `items` array present.
  3. Convert the amounts to minor units.

  The image SHALL NOT be persisted or logged. The scan screen SHALL state: "The photo is sent to Google Gemini to read it and is not stored by Quits."
- **R32 [Must]** IF Gemini errors, exceeds 25 s, or returns invalid output, THEN THE SYSTEM SHALL show "Couldn't read this receipt" with **Retry** and **Enter items manually**. The second option opens an empty receipt form.
- **R33 [Must]** THE SYSTEM SHALL show a review screen for the receipt:
  - Every extracted value is editable: merchant, date, currency, item names, quantities and amounts, tax, service charge, tip, discount, round-off and total. Items can be added and removed.
  - On every edit, it recomputes `diff = total − (Σitems + tax + service_charge + tip − discount + round_off)`.
  - IF `|diff| > 100` paise (₹1), THEN THE SYSTEM SHALL show a mismatch banner with the difference, flagging the receipt for manual review.
- **R34 [Must]** THE SYSTEM SHALL let the user assign items on one device: on each item, tap the member chips of whoever had it (several members are allowed). The phone can be passed around. Each item's amount is split equally among its assignees with R13. IF any item has no assignee, or `Σitems = 0`, THEN THE SYSTEM SHALL block finalizing and highlight the problem.
- **R35 [Must]** WHEN the user finalizes a receipt with its payer(s), THE SYSTEM SHALL atomically create an `itemized` expense and link the receipt:
  - **Amount:** the expense amount equals the **printed total**.
  - **Remainder:** `remainder = total − Σitems` covers tax, service charge, tip, discount, round-off and any unexplained difference. It is allocated with R13 in proportion to each member's item subtotal. A negative remainder is allocated as `|remainder|` and then negated.
  - **Owed:** each member owes their item share plus their remainder share.
  - **Log:** THE SYSTEM SHALL log `receipt.finalized`.
  - **Detail view:** the expense shows a per-item breakdown. IF `|diff| > 100` paise, THEN it also shows a "Total mismatch ₹X" badge.
- **R36 [Should]** WHEN a receipt is saved as a draft, THE SYSTEM SHALL let members on other devices open it and toggle their own items. Changes appear on refresh.

### 5.9 Receipt-extraction evaluation
- **R37 [Must]** THE SYSTEM SHALL include `eval/receipts/` with 10–15 images. Each `{id}.jpg` has a ground-truth `{id}.json` in the §4.3 schema, and personal data is blurred.

  WHEN `npm run eval` is run, THE SYSTEM SHALL pass each image through the same compression, prompt, schema and model as the app, then write `eval/results.json` and `eval/REPORT.md` with these metrics:
  - **Item match:** amounts within ₹1 **and** normalized-name similarity ≥ 0.6.
    - Normalization: lowercase, punctuation stripped, whitespace collapsed.
    - Similarity: `1 − Levenshtein / max length`.
    - Matching is one-to-one, greedy, highest similarity first.
  - **Item precision** = matched / predicted. **Item recall** = matched / ground truth. **F1** is their harmonic mean. All three are micro-averaged.
  - **Total accuracy:** the share of receipts whose predicted total is within ₹1 of the ground truth.
  - **Reconciliation rate:** the share of receipts whose predicted values give `|diff| ≤ ₹1` (R33).
  - **Mean latency** in seconds.
- **R38 [Must]** WHEN `/about` is opened, THE SYSTEM SHALL show the metrics from the committed `eval/results.json` (model, run date, n, precision, recall, F1, total accuracy, reconciliation rate, mean latency), a per-receipt table and a method note. It SHALL make no live Gemini call.
- **R39 [Should]** THE SYSTEM SHALL reach item F1 ≥ 0.80 and a reconciliation rate ≥ 0.70 on the eval set.

### 5.10 Search, charts, activity, export
- **R40 [Must]** WHEN a user applies search filters, THE SYSTEM SHALL return the non-deleted expenses that match **all** of the given filters:
  - text: a case-insensitive substring of the description or notes;
  - categories: any of those selected;
  - person: a payer or participant;
  - date range: inclusive.

  It SHALL show the match count and the total in base currency.
- **R41 [Should]** THE SYSTEM SHALL show bar charts of spending per person (Σ `owed_base`) and per category (Σ `base_amount`) for the current filter, with each bar labelled with its value.
- **R42 [Must]** WHEN any action listed in §4.1 occurs, THE SYSTEM SHALL append an activity entry.
  - The activity screen lists entries newest first, 50 per page, each with the actor's name (or "System"), a summary and an IST timestamp.
  - Update entries list each changed field as `old → new` (e.g. "Amount ₹500.00 → ₹600.00").
- **R43 [Must]** WHEN a user taps Export CSV, THE SYSTEM SHALL download `quits-{group-slug}-{YYYY-MM-DD}.csv`:
  - **Encoding:** UTF-8 with BOM, RFC 4180 quoting.
  - **Columns:** `type, date, description, category, notes, currency, amount, fx_rate, base_currency, base_amount, paid_by`, then one `owes:{member}` column per member.
  - **Rows:** one per non-deleted expense and settlement.
  - **Amounts:** major units.
  - **Formula guard:** any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.

### 5.11 Recurring expenses
- **R44 [Should]** WHEN a user sets "Repeat: weekly | monthly" with a start date (and an optional end date) on an expense, THE SYSTEM SHALL create a recurring rule from that expense.
- **R45 [Should]** WHEN a group is opened (group read), THE SYSTEM SHALL **lazily** create, before returning data, every due occurrence of each active rule that is not yet created. Due means a date ≤ today (IST) and ≤ `end_date`.
  - Creation is idempotent through the unique `(recurring_rule_id, recurring_occurrence)`.
  - At most 24 occurrences are created per rule per open.
  - Each expense is dated on its occurrence date.
  - Monthly occurrences use `anchor_date`'s day, clamped to month end (31st → Feb 28/29 → Mar 31).
  - There is no cron.
- **R46 [Should]** WHEN a user edits, pauses or deletes a rule, THE SYSTEM SHALL apply the change to future occurrences only. Generated expenses carry a "Recurring" label and are logged with actor System.
  - *Status (v0.6): partially met — rules can be paused, resumed or stopped (deleted), but not edited (D-20).*

### 5.12 Demo mode
- **R47 [Must]** WHEN a visitor taps "Try the demo", THE SYSTEM SHALL do the following, within 5 s:
  1. Delete demo groups created more than 7 days ago (lazy cleanup).
  2. Create a **new** demo group (`is_demo = true`) from the fixed seed in `lib/demo-seed.ts`.
  3. Open it.
- **R48 [Must]** THE SYSTEM SHALL seed the demo with the following content:
  - **Group and members:** the group "Flat 302 · HSR Layout" with 5 fictional members (Aarav, Priya, Rohan, Sneha, Kabir) and fake UPI IDs (`name@demo`).
  - **Expenses:** ≥ 15, dated relative to the seed day over the past 6 weeks, including:
    - rent with a *shares* split;
    - Wi-Fi;
    - an electricity bill with an *exact* split;
    - ≥ 3 Swiggy orders;
    - 2 grocery runs;
    - a Goa trip (train, hostel, scooter rental, and one **already itemized** beach-shack receipt with GST and service charge);
    - one *percent* split;
    - one multi-payer expense;
    - one **USD** expense with a fixed stored rate.
  - **Settlements:** one settlement already recorded.
  - **Final balances:** exactly **Aarav +₹4,000, Priya +₹3,000, Rohan +₹3,000, Sneha −₹6,000, Kabir −₹4,000**, which gives greedy 4 and optimal 3.
  - **No external calls** during seeding.

  Demo groups SHALL show the banner "Demo data — UPI IDs are fake."
- **R49 [Must]** WHEN "Reset demo" is tapped in a demo group, THE SYSTEM SHALL atomically delete that group's data, re-seed it under the same token, and log `demo.reset`. IF the group is not a demo group, THEN THE SYSTEM SHALL not offer the action and SHALL reject the request.

### 5.13 UI and PWA
- **R50 [Must]** THE SYSTEM SHALL meet these layout rules:
  - **Phone:** works from 360 px wide with no horizontal scrolling. Interactive targets are ≥ 44 × 44 CSS px. Group screens have a fixed bottom navigation with **Expenses · Settle · Activity · Group** (Group holds members, share, settings, stats, export and about). An "+" button opens Add expense or Scan receipt.
  - **Desktop (≥ 1024 px):** content sits in a centered column ≤ 640 px wide, and the navigation stays usable.
- **R51 [Must]** THE SYSTEM SHALL meet these UI quality rules:
  - It shows a loading state for every server call.
  - It labels every input, uses `inputmode="decimal"` for amounts, and meets WCAG AA text contrast.
  - It formats amounts per §3 and labels balances in words ("gets back ₹X" / "owes ₹X").
  - IF a server operation fails, THEN THE SYSTEM SHALL keep the user's form input, show a human-readable message, and log the error without secrets or image data.
- **R52 [Should]** THE SYSTEM SHALL be installable as a PWA. This needs:
  - a `manifest.webmanifest` with `name`, `short_name: "Quits"`, `start_url: "/"`, `display: "standalone"`, `theme_color` and `background_color`;
  - icons at 192 px, 512 px and 512 px maskable;
  - a 180 px apple-touch-icon.
- **R53 [Should]** THE SYSTEM SHALL show an offline fallback page through a service worker. No data is cached or synced.

### 5.14 Security and operations
- **R54 [Must]** THE SYSTEM SHALL enforce these data-access rules:
  - Migrations enable RLS on every table in `public`, with no policies.
  - The Supabase client, the secret key and the Gemini key exist only in server code. None of them appears in the client bundle or in any `NEXT_PUBLIC_*` variable.
  - The browser SHALL send no request to `*.supabase.co` or `generativelanguage.googleapis.com`.
  - Secrets SHALL never be committed to git.
- **R55 [Must]** THE SYSTEM SHALL validate every server input with zod, including the token format and UUIDs. IF any referenced ID (member, expense, settlement, receipt, rule) does not belong to the group resolved from the token, THEN THE SYSTEM SHALL reply 404 and change nothing.
- **R56 [Must]** THE SYSTEM SHALL send `Referrer-Policy: no-referrer` on all responses, and `X-Robots-Tag: noindex, nofollow` on `/g/*`.
- **R57 [Must]** THE SYSTEM SHALL include a GitHub Actions workflow (on a daily schedule and on `workflow_dispatch`) that calls `GET /api/health`.
  - The endpoint runs one trivial DB query and returns `{"ok":true}` with no data.
  - IF the DB query fails, THEN the endpoint SHALL return 503 and the workflow SHALL fail.
- **R58 [Must]** THE SYSTEM SHALL ship Vitest unit tests for every `lib/` module. `npm test` and `npm run build` SHALL both exit 0 on the delivered commit.

## 6. Acceptance criteria

**Test types**
- **[Unit]** Vitest.
- **[Script]** a command-line check.
- **[Phone]** a real Android phone, in Chrome.
- **[Desktop]** desktop Chrome at 1440 × 900.
- **[Deploy]** the production URL.

Unless marked *Should*, every AC is Must. Amounts are in ₹; the tests use paise. Members are listed in display order.

**Money, splits, balances**
- **AC-1 [Unit] (R9, R13):** equal splits:
  - ₹100.00 (10000 paise) among A, B, C → `[3334, 3333, 3333]`.
  - 100 paise among 7 members → `[15, 15, 14, 14, 14, 14, 14]`.
- **AC-2 [Unit] (R9, R13):** weighted splits:
  - 999 paise by percent `[50, 25, 25]` → `[499, 250, 250]`.
  - 1001 paise by shares `[2, 1, 1]` → `[501, 250, 250]`.
- **AC-3 [Unit] (R9):** exact amounts summing to 9999 for a total of 10000 are rejected with difference `1`. Percentages summing to 99.99 are rejected.
- **AC-4 [Unit] (R11, R14):** balances:
  - A pays ₹300 split equally among A, B, C → A +200, B −100, C −100.
  - A pays ₹600 and B pays ₹400 for ₹1,000 split equally among 4 → A +350, B +150, C −250, D −250.
  - A soft-deleted expense contributes nothing.
- **AC-5 [Unit] (R13, R14):** a seeded PRNG generates 1,000 random groups (2–12 members, 1–40 expenses with random split types, multiple payers, currencies and settlements). For every group:
  - each expense's payers and splits each sum to its total, in both currencies;
  - Σ balances = 0.

**Currency**
- **AC-6 [Unit] (R17):** conversions:
  - USD 12.34 (1234) at `"83.4567"` → 102986 paise; split equally among 3 → `[34329, 34329, 34328]`.
  - THB 10.05 (1005) at `"2.35"` → exactly 2362 (half-up of 2361.75).
  - JPY 1000 (exponent 0) at `"0.5612"` → 56120.
- **AC-7 [Unit] (R18):** with the rate fetcher mocked to time out and an empty cache, conversion returns `RATE_UNAVAILABLE`. With a supplied manual rate, the saved values have `fx_source = manual`.
- **AC-8 [Deploy] (R15, R16):**
  1. A USD 10.00 expense dated 2026-10-01 stores the same rate that the Frankfurter v2 adapter returns for that date, and the expense shows the rate and rate date.
  2. Editing only its description leaves `fx_rate` unchanged. Changing its date re-fetches the rate.
  3. An INR expense has `fx_source = identity`.
  4. Changing the base currency of a group that has expenses is rejected.

**Simplification**
- **AC-9 [Unit] (R19, R20):** balances in member order: A +400, B +300, C +300, D −600, E −400 (₹).
  - **Greedy** returns exactly `[D→A 400, E→B 300, D→C 200, E→C 100]`, which is 4 payments. The B/C tie on step 2 goes to B by member order.
  - **Optimal** returns exactly `[E→A 400, D→B 300, D→C 300]`, which is 3 payments, from the subsets {A, E} and {B, C, D}.
  - Applying either list zeroes every balance.
- **AC-10 [Unit] (R21):** A pays ₹300 and B pays ₹600, each split equally among A, B, C → naive **3**, greedy **1**, optimal **1** (`C→B 300`).
- **AC-11 [Unit] (R19):** edge cases and brute force:
  - All-zero balances → 0 payments. `{+x, −x}` → 1 payment.
  - For 300 random cases with n ≤ 8, the optimal count equals a brute-force search over all set partitions and is ≤ the greedy count.
- **AC-12 [Unit] (R19):** scale and determinism:
  - 18 random nonzero balances are solved exactly in < 2 s.
  - 19 nonzero balances → `algorithm = "greedy"`, `optimal = null`.
  - Two runs on the same input are deep-equal.

**UPI and settlements**
- **AC-13 [Unit] (R6, R24):**
  - `buildUpiLink({pa:"priya@okicici", pn:"Priya S", amountMinor:45050, groupName:"Goa Trip"})` returns exactly `upi://pay?pa=priya@okicici&pn=Priya%20S&am=450.50&cu=INR&tn=Quits%3A%20Goa%20Trip`.
  - The UPI ID check accepts `rohan.k@oksbi` and `9876543210@ybl`, and rejects `rohan`, `@ybl`, `a b@ok` and `x@1`.
- **AC-14 [Phone] (R24, R25):** on a real phone in Chrome, with a payee set to the tester's own UPI ID, on the Settle screen:
  1. "Save QR image" saves the QR. Scanning it from the gallery in at least one of GPay, PhonePe or Paytm shows that payee and the amount filled in.
  2. "Show full screen" shows the QR large enough for a second phone's UPI app to scan, again with the payee and amount filled in.
  3. Saving, scanning and opening record nothing; balances change only after "Mark as paid".

  The deep link's format is covered by AC-13 (Unit). Its per-app behaviour is best-effort (R59) and is recorded in the README, but does not affect this AC.
- **AC-15 [Desktop + Phone] (R24):** on desktop, the Settle screen shows the UPI QR code without any toggle. Scanning it with a phone UPI app shows the same payee and amount. "Copy UPI ID" puts the exact ID on the clipboard, and the amount is shown in large text next to it.
- **AC-16 [Deploy] (R23, R25):**
  - "Mark as paid" → confirm: the suggestion disappears, both balances change by the amount, and the activity log shows `settlement.created`.
  - A payee without a UPI ID shows "Add a UPI ID for {name}".
  - A non-INR group shows no UPI actions.
- **AC-46 [Unit + Phone, *Should*] (R59, R60):**
  - `parseUpiUri("upi://pay?pa=priya%40okicici&pn=Priya%20S&mc=0000")` returns `{ pa: "priya@okicici", pn: "Priya S" }`, and a non-UPI string returns `null`.
  - On a phone, uploading a screenshot of the tester's own UPI QR sets their UPI ID and name. The network log shows only those two values sent, and no image.
  - The "Pay via UPI" button is labelled "May be blocked by some UPI apps", and tapping it records no payment.

**Receipts**
- **AC-17 [Unit] (R33):** items `[25000, 18000]` with tax 2150:
  - total 45150 → diff 0;
  - total 45300 → diff +150, which is flagged;
  - |diff| = 100 is not flagged, and 101 is flagged.
- **AC-18 [Unit] (R34, R35):** Pizza ₹400 (A, B), Coke ₹100 (A), Pasta ₹300 (C). Subtotals are A 30000, B 20000, C 30000 paise.
  - Tax ₹40, printed total ₹840 → owed A 31500, B 21000, C 31500.
  - Tax ₹40, printed total ₹845 → the remainder 4500 is allocated `[1688, 1125, 1687]`. Owed is A 31688, B 21125, C 31687, summing to 84500. The mismatch badge shows (diff 500).
  - A ₹100 item shared by 3 → `[3334, 3333, 3333]`.
  - A negative remainder (discount > tax) still sums exactly to the printed total.
- **AC-19 [Unit] (R31, R32):** the zod parser converts `"amount": 12.5` to 1250. It rejects output with a missing `items` field or a negative item amount. A Gemini client mocked to time out yields `EXTRACT_FAILED` without throwing.
- **AC-20 [Phone + Desktop] (R27, R29, R31):**
  - On a phone, Scan → Camera opens the rear camera. A 12 MP photo uploads with a logged request size ≤ 1,000,000 bytes, and editable items appear within 20 s.
  - On desktop, Ctrl+V of a copied receipt image shows a preview and starts extraction.
- **AC-21 [Script] (R30):** with the per-group limit set to 2 by env var:
  - a 2 MB JPEG → 413;
  - a text file renamed to `.jpg` → 415;
  - the 3rd valid scan of the day → 429;
  - the server log shows no Gemini call for any of these.
- **AC-22 [Deploy] (R33, R34, R35):**
  1. Editing an extracted amount updates the diff banner immediately.
  2. Finalizing with an unassigned item is blocked.
  3. After all items are assigned, finalizing creates an `itemized` expense. Its amount equals the printed total, and its splits equal the on-screen per-person totals.
  4. A receipt finalized with |diff| > ₹1 shows the mismatch badge.

**Evaluation**
- **AC-23 [Unit] (R37):** a fixture with 4 ground-truth items and 3 predicted items, 2 of them matching, gives precision 0.667, recall 0.500, F1 0.571 (to 3 dp). `"Paneer Tikka"` vs `"paneer tikka."` with equal amounts is a match.
- **AC-24 [Script + Deploy] (R37, R38):**
  - `eval/receipts/` holds 10–15 image/JSON pairs.
  - `npm run eval` exits 0 and writes `eval/results.json` (`model, runAt, n, precision, recall, f1, totalAccuracy, reconciliationRate, meanLatencySec, perReceipt[]`) and `eval/REPORT.md`.
  - `/about` shows the same numbers, and the network log shows no Gemini call.
- **AC-25 [Script, *Should*] (R39):** `results.json` has `f1 ≥ 0.80` and `reconciliationRate ≥ 0.70`.

**Groups, identity, expenses**
- **AC-26 [Unit + Deploy] (R1):**
  - 10,000 generated tokens are all unique, each ≥ 22 chars matching `^[A-Za-z0-9_-]+$`.
  - `/g/doesnotexist` and `/g/{random 22-char token}` return the same 404 page.
- **AC-27 [Desktop + Phone] (R1, R2, R4, R6):**
  1. Create a group on desktop; the share notice "Anyone with this link can view and edit this group." is shown.
  2. Open the link on a phone. The picker appears; pick Priya.
  3. Reload. You are still Priya, labelled "You".
  4. "Switch person" brings the picker back.
  5. Adding "priya" is rejected with "Name already used".
- **AC-28 [Deploy] (R9):** after setting the default split to shares 2:1:1, a new expense form opens pre-filled with those shares.
- **AC-29 [Deploy] (R11, R42):**
  - Editing an amount from ₹500 to ₹600 logs "Amount ₹500.00 → ₹600.00" with the actor's name.
  - Deleting the expense logs the deletion and removes it from balances and search.
- **AC-30 [Deploy, *Should*] (R12):** Restore brings the deleted expense back into balances and logs `expense.restored`.
- **AC-31 [Deploy] (R40):** in a fresh demo group:
  - "swiggy" returns exactly the seed's Swiggy expenses;
  - category Travel with the Goa date range returns exactly the Goa expenses;
  - each count matches the seed.
- **AC-32 [Unit] (R43):** the CSV output:
  - starts with the BOM, with a header row equal to the specified columns;
  - writes `=SUM(A1)` as `'=SUM(A1)`;
  - quotes and escapes a value containing `,` and `"` per RFC 4180;
  - leaves out deleted rows.
- **AC-33 [Desktop, *Should*] (R41):** the per-category bar values sum to the filtered total shown by search.

**Recurring (*Should*)**
- **AC-34 [Unit, *Should*] (R45):**
  - A monthly rule anchored on 2026-01-31 yields 2026-01-31, 02-28, 03-31 and 04-30.
  - `occurrencesDue` returns nothing new on a second call once the first results are marked as created.
- **AC-35 [Deploy, *Should*] (R44, R45):**
  1. Create a monthly rule starting on the same day of the month two months ago.
  2. Reopen the group: exactly 3 generated expenses exist.
  3. Reopen again: still 3.

**Demo**
- **AC-36 [Unit] (R48):** balances computed from `lib/demo-seed.ts` are Aarav +400000, Priya +300000, Rohan +300000, Sneha −600000 and Kabir −400000 paise. Greedy gives 4 payments and optimal gives 3.
- **AC-37 [Desktop] (R22, R47, R48):** in a fresh incognito window, "Try the demo" opens the group within 5 s. It shows:
  - the demo banner;
  - ≥ 15 expenses;
  - an itemized receipt expense with a per-item breakdown;
  - a USD expense with its rate;
  - on Settle, naive *N*, greedy 4 and optimal 3, labelled with the algorithm used.
- **AC-38 [Deploy] (R47, R49):**
  1. Delete a demo expense, then tap Reset. The expense is back, the balances equal AC-36, and the URL is unchanged.
  2. A Reset request for a non-demo group is rejected.
  3. Set a demo group's `created_at` to 8 days ago, then create a new demo. The old demo group no longer exists.

**UI and PWA**
- **AC-39 [Phone + Desktop] (R50, R51):**
  - At 360 × 740 and on a real phone, every screen has `scrollWidth ≤ innerWidth`. Bottom-nav items, the "+" button and primary buttons measure ≥ 44 × 44 px.
  - At 1440 × 900, content sits in a centered column ≤ 640 px, and the add, settle and scan flows can all be completed.
- **AC-40 [Phone, *Should*] (R52):** Chrome on Android offers "Install app". The installed app opens standalone with the Quits icon.

**Security and operations**
- **AC-41 [Script] (R54):**
  - `select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;` returns 0 rows.
  - A REST request with the publishable key returns no rows or a permission error for every table.
- **AC-42 [Deploy + Script] (R54):**
  - Across all flows on the production URL, the network log shows no request to `*.supabase.co` or `generativelanguage.googleapis.com`.
  - `grep -rE "sb_secret_|AIza" .next/static` finds nothing.
  - `git log -p --all | grep -E "sb_secret_|AIza"` finds nothing.
  - `.env.local` is gitignored.
- **AC-43 [Script] (R55, R56):**
  - Creating an expense in group X with a member ID from group Y returns 404, and no row is created.
  - Deleting group Y's expense through group X's token returns 404, and nothing changes.
  - `curl -I {url}/g/{token}` shows `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`.
- **AC-44 [Script] (R57):** a manual `workflow_dispatch` run succeeds, and `GET /api/health` returns `{"ok":true}`. With a wrong DB URL on a preview deployment, the endpoint returns 503.
- **AC-45 [Script] (R58):** `npm test` and `npm run build` both exit 0 on the delivered commit.

## 7. Deliverables

| Deliverable | Location |
|---|---|
| Deployed app | Vercel production URL (in README and repo description) |
| Source repo | GitHub repository `quits` |
| Specification | `SPEC.md` |
| Plan | `PLAN.md`: phases and tasks mapped to R#/AC-#. The Frankfurter v2 endpoint was confirmed in Phase 1. |
| Migrations | `supabase/migrations/*.sql` (tables, constraints, RLS, RPC functions) |
| Unit tests | `tests/**/*.test.ts`; `npm test` |
| Eval | `eval/receipts/*.{jpg,json}`, `eval/run.ts` (`npm run eval`), `eval/results.json`, `eval/REPORT.md`; rendered on `/about` |
| Keep-alive | `.github/workflows/keepalive.yml` (calls `${{ vars.APP_URL }}/api/health`) |
| CI | `.github/workflows/ci.yml`: on `ubuntu-24.04`, runs `npm ci`, lint and `npm test` on every push |
| Env template | `.env.example` (names only) |
| PWA assets | `public/manifest.webmanifest`, icons (Should) |
| README | live URL, demo steps, local setup, env variable names, deploy steps, test and eval commands, UPI app results (AC-14), known limitations (incl. last write wins), AC status checklist |

## 8. Non-goals

- User accounts, logins, OTP, or per-member permissions.
- **Edit-conflict detection.** Concurrent edits follow **last write wins**; the activity log shows both edits.
- **Vercel Cron, or any server-side scheduler.** Recurring expenses are created lazily on group open; the keep-alive is the GitHub Action only.
- Processing, receiving or verifying payments; UPI collect requests; payment callbacks.
- Bank, SMS or UPI transaction import, or any bank integration.
- Offline editing or sync (only the Should offline page, R53).
- Native apps or app-store distribution.
- Push, email, SMS or WhatsApp notifications and reminders.
- Real-time collaboration; refreshing shows others' changes.
- Custom categories, budgets, income tracking, loans.
- Deleting groups (other than demo cleanup) or rotating links.
- Storing receipt images, or reading PDF receipts.
- Localization beyond English with Indian number formatting.
- Groups with more than 50 members.

## 9. Risks and fallbacks

| # | Risk | Fallback / mitigation |
|---|---|---|
| K1 | UPI apps block P2P deep links from websites. **Confirmed in P1-8:** blocked in GPay, PhonePe and Paytm; GPay shows a misleading "exceeded bank limit" error at ₹1. | Settle-up is **QR-first** (R24), and each path was confirmed in P1-8: a QR on a laptop scanned by the phone, and a QR screenshot scanned from the gallery in GPay. Also "Copy UPI ID" with the amount in large text. The deep link is only a best-effort Should (R59), and recording is always manual via "Mark as paid" (R25). |
| K2 | Gemini misreads receipts or returns invalid JSON. | Schema-constrained output and zod validation; the ₹1 mismatch banner and badge; every field editable; manual entry. Accuracy is measured and published (R37, R38). |
| K3 | Gemini is unavailable, the model is renamed, or the quota runs out during grading. | `GEMINI_MODEL` env var; rate limits (R30); the demo includes an already itemized receipt; eval results are pre-computed. |
| K4 | Vercel body-size limit or function timeout. | ≤ 1 MB browser compression; binary multipart upload; `maxDuration = 60` and a 25 s Gemini timeout with Retry. |
| K5 | The Supabase free project pauses. | Daily GitHub Action health ping (R57). GitHub can delay schedules or disable them after 60 days of repo inactivity: re-enable the workflow and run `workflow_dispatch` the day before grading. |
| K6 | **The Frankfurter v2 endpoint, parameters or response shape change**, or the service is down. | Confirmed in Phase 1 (§4.3). Keep all Frankfurter specifics in one adapter plus a parser unit test. `fx_rates` cache; manual rate entry (R18); demo rates fixed in the seed. |
| K7 | A group link leaks. | 128-bit tokens; `no-referrer` and `noindex` headers; soft delete plus activity log (Restore is Should). The limitation is stated in the UI (R2). |
| K8 | Concurrent edits overwrite each other. | Accepted: last write wins (non-goal); the activity log records both edits. |
| K9 | iPhone HEIC photos or very large images fail to decode. | `accept="image/*"` (iOS converts to JPEG); a clear error (R29); upload a screenshot instead. |
| K10 | Exact DP becomes slow. | Cap at 18 nonzero balances (2¹⁸ states, milliseconds); greedy above that. |
| K11 | Three days is not enough. | Build order: `lib/` + tests → DB + RLS → groups and expenses → settle + UPI → receipts → demo → eval → polish. Cut Shoulds in this order: R60, R36, R53, R41, R44–R46, R10, R52, R3, R5, R7, R12, R26, R59, R28, R39. |
| K12 | Free-tier Gemini inputs may be used by Google. | Notice on the scan screen (R31); eval images have personal data removed; images are not stored by Quits. |
| K13 | Lazy recurring expenses appear only when someone opens the group. | Accepted: each is dated on its occurrence date, so balances are correct the moment they are viewed. |

## 10. Decisions and open questions

### 10.1 Decisions (answered 2026-10-16)

| ID | Was | Decision |
|---|---|---|
| D-1 | OQ-1 | The base currency is locked after the first expense (R15). |
| D-2 | OQ-2 | Receipt images are not stored; only the extracted and edited data is kept (R31). |
| D-3 | OQ-3 | The itemized expense amount is the **printed total**. `total − Σitems` (tax, tips, discount, round-off and any unexplained difference) is allocated in proportion to item subtotals. If \|diff\| > ₹1, the expense shows a mismatch badge (R35). |
| D-4 | OQ-4 | UPI actions appear only when the base currency is INR (R25). |
| D-5 | OQ-5 | Each tap creates a fresh demo group. Demo groups older than 7 days are deleted lazily when a new demo is created (R47). |
| D-6 | OQ-6 | The demo shows the member picker (no preselected identity). |
| D-7 | OQ-7 | Recurring frequencies: weekly and monthly only. |
| D-8 | OQ-8 | Naive = the number of member pairs with a nonzero pairwise net amount (R21). |
| D-9 | OQ-9 | Scan limits: 30 per group and 300 per app per day, set by env var (R30). |
| D-10 | OQ-10 | Eval receipts are own and friends' real receipts, with personal data blurred and labels made by hand. |
| D-11 | OQ-11 | Anyone with the link can delete. Soft delete is Must (R11); Restore is Should (R12). |
| D-12 | OQ-12 | Running the eval script and reporting precision, recall and reconciliation is Must (R37, R38). The quality targets are Should (R39). |
| D-13 | OQ-13 | Partial settlements need no special handling; the amount is editable. |
| D-14 | OQ-14 | At least one of GPay, PhonePe or Paytm must pass AC-14, with all three recorded. The UPI QR fallback is **Must** (R24, AC-15). *Superseded by D-18 for the deep link.* |
| D-15 | OQ-15 | `/api/health` is public with no secret. It runs one trivial query and returns only `{"ok":true}` (R57). |
| D-16 | OQ-16 | No extra confirmation when finalizing a receipt with \|diff\| > ₹1; the banner on the review screen and the badge on the expense are enough (R33, R35). |
| D-18 | P1-8 (2026-10-16) | **Settle-up is QR-first.**<br>**Must:** the QR with payee and amount, "Save QR image", "Show full screen", and "Copy UPI ID" with the amount in large text (R24).<br>**Should, best-effort:** the `upi://` button, labelled "May be blocked by some UPI apps" (R59).<br>**Recording:** settlement is never automatic; it happens only on "Mark as paid" (R25).<br>**Should:** set your UPI ID from a screenshot of your own UPI QR, decoded in the browser; only the ID and name are saved (R60). |
| D-19 | Build (2026-10-17) | **Itemized expenses cannot be edited after finalizing.** To correct one, delete it (soft delete; Restore is possible) and scan or enter the receipt again. The edit form refuses itemized expenses, and the expense detail offers only Delete. Before finalizing, every value stays editable in the draft (R33). |
| D-20 | Build (2026-10-17) | **R46 is partially met.** Recurring rules can be paused, resumed or stopped (deleted), and the change applies to future occurrences only. Rules cannot be edited; to change one, stop it and add a new repeating expense. |
| D-17 | OQ-17 | When Frankfurter v2 has no rate for the exact date, use the most recent rate on or before `expense_date`, and store and show its `fx_rate_date` (R16). |

### 10.2 Open questions

None open. New questions found during the build are added here with a proposed default (see the `PLAN.md` rules).

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| v0.1 | 2026-10-16 | Initial draft |
| v0.2 | 2026-10-16 | **Scope cut for a 3-day build:** 102 → 58 requirements (43 Must, 15 Should); 73 → 45 ACs (39 Must, 6 Should); overlapping requirements merged. **Moved to non-goals:** version-conflict checks (now last write wins, stated explicitly) and Vercel Cron. **Made Should:** drag-and-drop upload, QR of the group link, Restore, multi-device item claiming (single-device claiming stays Must). **Recurring expenses:** now created lazily on group open, with no cron. **Keep-alive:** the GitHub Action only, calling `/api/health`; `CRON_SECRET` removed. **Greedy:** defined exactly, with the deterministic 4-vs-3 example sequence in AC-9; the optimal partition is now recovered deterministically. **Decisions:** OQ-1 to OQ-14 resolved as D-1 to D-14. D-3 changes receipt finalize to use the printed total, with a mismatch badge, and adds a printed-total case to AC-18. D-5 adds lazy cleanup of old demos; D-14 makes the UPI QR code Must. **§1:** rewritten with Splitwise free/Pro details, Spliit and Tricount, and Quits' edge. **Exchange rates:** Frankfurter v1 replaced by v2 (endpoint confirmed in Phase 1; new risk K6); added K13 and OQ-15 to OQ-17. **Kept:** every Must test of money maths, the balance invariant, simplification, the UPI link, reconciliation, security and demo mode. The only ACs dropped were for version conflicts (now a non-goal) and member archiving (Should). |
| v0.3 | 2026-10-16 | **Decisions:** OQ-15 to OQ-17 accepted as D-15 to D-17 (public `/api/health`; no extra confirmation for receipt mismatches; nearest earlier rate for weekend and holiday dates). **Env names (§3):** listed in full, adding `SUPABASE_DB_URL` (local only, for migrations), `SCAN_LIMIT_PER_GROUP`, `SCAN_LIMIT_PER_APP` and the repo variable `APP_URL`. **Deliverables:** CI workflow (`ci.yml`, ubuntu-24.04) added. Counts unchanged: 58 requirements (43 Must, 15 Should), 45 ACs. `PLAN.md` created. |
| v0.4 | 2026-10-16 | Approved PLAN.md proposals SC-1 to SC-3 (wording only; the code already followed them). **SC-1 (§4.3, §3, K6):** the Frankfurter v2 request and response confirmed in P1-7 (`/v2/rate/{BASE}/{QUOTE}?date=`; same-date blended weekend rates; 404 for future dates, so those use the latest rate; 422 for unknown currencies). **SC-2 (§3, §4.3, R31):** Gemini structured output uses `responseJsonSchema`. **SC-3 (R17):** base payer and split amounts are allocated by exact original-currency proportions (the split's own weights), not rounded minor-unit shares, matching AC-6. Counts unchanged: 58 requirements (43 Must, 15 Should), 45 ACs. |
| v0.5 | 2026-10-16 | **Settle-up is QR-first (D-18),** after P1-8 showed `upi://` P2P links blocked in GPay, PhonePe and Paytm from a website, while QR scans (laptop screen, gallery screenshot) worked with the payee and amount filled in.<br>**R24 (Must):** the QR is visible at every width, plus "Save QR image", "Show full screen", and "Copy UPI ID" with the amount in large text.<br>**R25:** settlement is never automatic, only on "Mark as paid"; the "Did the payment go through?" prompt is removed.<br>**New R59 (Should):** best-effort "Pay via UPI" link labelled "May be blocked by some UPI apps".<br>**New R60 (Should):** set a UPI ID from a screenshot of your own UPI QR, decoded in the browser; only `pa`/`pn` are saved; `members.upi_name` added; `pn` uses it.<br>**ACs:** AC-14 is now the phone QR path (save + gallery scan, full screen); the link format stays Unit (AC-13). AC-15 adds the large amount. New AC-46 (Should) covers R59/R60.<br>**Elsewhere:** §1 edge, S4, §4.1, §4.3, K1, K11 and D-14 updated.<br>**Counts:** 60 requirements (43 Must, 17 Should); 46 ACs (39 Must, 7 Should), one over the earlier ≤ 45 target because of the new Should AC. |
| v0.6 | 2026-10-17 | **Honesty decisions recorded after the build.** D-19: itemized expenses can't be edited after finalizing; delete and rescan instead. D-20: R46 is partially met (pause, resume and stop; no edit), and R46 is annotated accordingly. Counts unchanged: 60 requirements (43 Must, 17 Should; R46 partially met), 46 ACs. |
