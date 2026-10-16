# Receipt-extraction evaluation (SPEC R37–R39)

## Data

- Put 10–15 **real** receipt photos in `eval/receipts/`: restaurant, café, grocery and food-delivery screenshots.
- Name them `{id}.jpg`, `{id}.png` or `{id}.webp`, e.g. `r01.jpg`.
- **Blur personal data before committing:** phone numbers, card digits, names, GSTIN if you prefer.
- For each image, add `{id}.json` with the true values in the SPEC §4.3 schema. Amounts are in major units, exactly as printed.
- Set `"reviewed": true` in a ground-truth file once a human has checked it against the paper bill. The eval ignores this field.

```json
{
  "merchant": "CAFE MONSOON",
  "date": "2026-10-12",
  "currency": "INR",
  "items": [{ "name": "Masala Dosa", "quantity": 1, "amount": 120.0 }],
  "tax": 30.0,
  "service_charge": 30.0,
  "tip": 0,
  "discount": 0,
  "round_off": 0,
  "total": 660.0
}
```

The rules for each field:

- **`amount`:** the line total, not the unit price.
- **`tax`:** the sum of all tax lines (CGST + SGST, VAT, cess).
- **`discount`:** a positive number.
- **`round_off`:** negative when it reduces the bill.
- **Missing fields:** use `0`, or `null` for `merchant`, `date` and `currency`.
- **Modifiers** printed under an item (e.g. "Extra: 2 pcs = 150") stay inside that item's line total.
- **Fees:** a voluntary staff contribution or a delivery app's platform fee counts as `service_charge`.
- **Delivery apps:** `total` is the amount paid after coupons; the coupon is the `discount`.

## Run

```bash
npm run eval                 # real set: eval/receipts → eval/results.json + eval/REPORT.md
npm run eval:synthetic       # smoke test only: eval/synthetic (one generated receipt)
```

**What the run uses:** the same compression rules, prompt, JSON schema, model (`GEMINI_MODEL`) and parser as the app. `GEMINI_API_KEY` comes from `.env.local`.

**Metrics** (all micro-averaged):

- **Item match:** the amount is within ₹1 and the name similarity is ≥ 0.6.
- **Precision, recall and F1** over the items.
- **Total accuracy:** the predicted total is within ₹1.
- **Reconciliation rate:** the predicted values give |diff| ≤ ₹1.
- **Mean latency** per receipt.

`/about` shows the committed `eval/results.json`. It makes no live Gemini calls.

`eval/synthetic/` holds one computer-generated receipt, used only to check that the script works. Its results are **not** the accuracy of Quits.
