## Run 2 (main result)

- Model: `gemini-3.5-flash-lite` · run 2026-10-16T19:58:02.337Z
- Receipts: 5 (n = 5, small sample: one receipt moves a per-receipt rate by 20.0%.)

**Eval-setup fixes since run 1:**

- D-32: every receipt's predicted values are saved (fields, items, diff, unmatched items, failure reason), so a miss can be explained from the file.

**Code fixes:** none. Same images, ground truth, prompt, schema, model and scorer as run 1; no app code changed. The difference from run 1 is run-to-run variation of the model.

| Metric | Value |
|---|---|
| Item precision | 97.7% |
| Item recall | 87.5% |
| Item F1 | 92.3% |
| Total accuracy (±₹1) | 80.0% |
| Reconciliation rate (\|diff\| ≤ ₹1) | 40.0% |
| Mean latency | 13.32 s |

| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |
|---|---|---|---|---|---|---|
| r01 | 35 | 34 | 34 | yes | no | 21.997 |
| r02 (failed) | 0 | 6 | 0 | no | no | 25.017 |
| r03 | 3 | 3 | 3 | yes | yes | 8.751 |
| r04 | 2 | 2 | 2 | yes | no | 3.399 |
| r05 | 3 | 3 | 3 | yes | yes | 7.414 |

Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).

### Saved predictions (D-32)

✗ marks a field that differs from the ground truth. diff = total − (Σitems + tax + service + tip − discount + round-off).

### r01 (not reconciled)

Items: 35 predicted, 34 true, 34 matched · Σitems 19255.00 (true 19105.00) · diff -150.00

| Field | Predicted | True |
|---|---|---|
| tax | 955.26 | 955.26 |
| service_charge | 1910.50 | 1910.50 |
| tip | 0.00 | 0.00 |
| discount | 0.00 | 0.00 |
| round_off | 0.24 | 0.24 |
| total | 21971.00 | 21971.00 |

Extra predicted items: Dimsums Extra: 2 Pcs Extra Dimsums - 1x150 = 150 ×1 = 150.00

### r02

No answer (timeout, 25.017 s).

### r03

Items: 3 predicted, 3 true, 3 matched · Σitems 528.00 (true 528.00) · diff 0.00

| Field | Predicted | True |
|---|---|---|
| tax | 57.04 | 57.04 |
| service_charge | 0.00 | 0.00 |
| tip | 0.00 | 0.00 |
| discount | 80.00 | 80.00 |
| round_off | 0.00 | 0.00 |
| total | 505.04 | 505.04 |

### r04 (not reconciled)

Items: 2 predicted, 2 true, 2 matched · Σitems 200.00 (true 200.00) · diff 14.99

| Field | Predicted | True |
|---|---|---|
| tax | 12.70 | 12.70 |
| service_charge | 0.00 ✗ | 14.99 |
| tip | 0.00 | 0.00 |
| discount | 140.00 | 140.00 |
| round_off | 0.00 | 0.00 |
| total | 87.69 | 87.69 |

### r05

Items: 3 predicted, 3 true, 3 matched · Σitems 413.00 (true 413.00) · diff 0.00

| Field | Predicted | True |
|---|---|---|
| tax | 17.56 | 17.56 |
| service_charge | 0.00 | 0.00 |
| tip | 0.00 | 0.00 |
| discount | 61.95 | 61.95 |
| round_off | 0.39 | 0.39 |
| total | 369.00 | 369.00 |

