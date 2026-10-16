# Receipt extraction eval — real receipts

## Answer rate and accuracy when answered (all runs)

n = 5, small sample. "Answered" means Gemini returned a valid reading within the limit. **Overall** counts a receipt with no answer as all items missed and the total wrong; **when answered** counts only the answered receipts. Computed from each run's saved results file.

| | Run 1 | Run 2 | Run 3 (main) |
|---|---|---|---|
| Limit | 25 s, no retry | 25 s, no retry | 25 s, no retry |
| **Answer rate** | **100.0%** (5/5) | **80.0%** (4/5) | **80.0%** (4/5) |
| Item precision: overall / when answered | 98.0% / 98.0% | 97.7% / 97.7% | 100.0% / 100.0% |
| Item recall | 100.0% / 100.0% | 87.5% / 100.0% | 29.2% / 100.0% |
| **Item F1** | 99.0% / 99.0% | 92.3% / 98.8% | 45.2% / 100.0% |
| Total accuracy | 100.0% / 100.0% | 80.0% / 100.0% | 80.0% / 100.0% |
| **Reconciliation rate** | 60.0% / 60.0% | 40.0% / 50.0% | 80.0% / 100.0% |

## Run 3 (main result)

- Model: `gemini-3.5-flash-lite` · run 2026-10-16T20:05:23.794Z
- Receipts: 5 (n = 5, small sample: one receipt moves a per-receipt rate by 20.0%.)

**Eval-setup fixes since run 1:**

- D-32 (since run 2, unchanged): every receipt's predicted values are saved (fields, items, diff, unmatched items, failure reason).

**Code fixes found by the eval (the app changed):**

- D-34 (product bug fix, found by run 2's r01): lines printed under an item (add-ons, extras) are part of that item's amount, not separate items.
- D-34 (product bug fix, found by run 2's r04): platform, packaging, convenience and delivery fees go in service_charge.

Same images, ground truth, schema, model and scorer as runs 1-2; only the prompt changed.

**Blindness:** Not blind for r01/r04: prompt fixed after run 2 revealed these gaps. r02, r03 and r05 did not shape the fixes.

| Metric | Value |
|---|---|
| Item precision | 100.0% |
| Item recall | 29.2% |
| Item F1 | 45.2% |
| Total accuracy (±₹1) | 80.0% |
| Reconciliation rate (\|diff\| ≤ ₹1) | 80.0% |
| Mean latency | 11.17 s |

| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |
|---|---|---|---|---|---|---|
| r01 (failed) | 0 | 34 | 0 | no | no | 25.016 |
| r02 | 6 | 6 | 6 | yes | yes | 4.726 |
| r03 | 3 | 3 | 3 | yes | yes | 17.052 |
| r04 | 2 | 2 | 2 | yes | yes | 3.431 |
| r05 | 3 | 3 | 3 | yes | yes | 5.619 |

Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).

### Saved predictions (D-32)

✗ marks a field that differs from the ground truth. diff = total − (Σitems + tax + service + tip − discount + round-off).

### r01

No answer (timeout, 25.016 s).

### r02

Items: 6 predicted, 6 true, 6 matched · Σitems 2770.00 (true 2770.00) · diff 0.00

| Field | Predicted | True |
|---|---|---|
| tax | 138.50 | 138.50 |
| service_charge | 0.00 | 0.00 |
| tip | 0.00 | 0.00 |
| discount | 0.00 | 0.00 |
| round_off | -0.50 | -0.50 |
| total | 2908.00 | 2908.00 |

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

### r04

Items: 2 predicted, 2 true, 2 matched · Σitems 200.00 (true 200.00) · diff 0.00

| Field | Predicted | True |
|---|---|---|
| tax | 12.70 | 12.70 |
| service_charge | 14.99 | 14.99 |
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

## Run 2 (kept exactly as run; `results-run2.json`)

_Run 2's report section, verbatim (it says "main result" because it was the main result then)._

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

## Run 1 (kept exactly as run; `results-run1.json`)

_Run 1's report, verbatim. It saved no predicted values, so its misses cannot be explained from the file._

# Receipt extraction eval — real receipts

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-10-16T19:48:46.441Z
- Receipts: 5

| Metric | Value |
|---|---|
| Item precision | 98.0% |
| Item recall | 100.0% |
| Item F1 | 99.0% |
| Total accuracy (±₹1) | 100.0% |
| Reconciliation rate (\|diff\| ≤ ₹1) | 60.0% |
| Mean latency | 5.89 s |

| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |
|---|---|---|---|---|---|---|
| r01 | 35 | 34 | 34 | yes | no | 10.078 |
| r02 | 6 | 6 | 6 | yes | yes | 4.217 |
| r03 | 3 | 3 | 3 | yes | yes | 6.169 |
| r04 | 2 | 2 | 2 | yes | no | 4.919 |
| r05 | 3 | 3 | 3 | yes | yes | 4.083 |

Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).
