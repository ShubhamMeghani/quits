# Receipt extraction eval — synthetic smoke test

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-10-16T13:57:05.711Z
- Receipts: 1

| Metric | Value |
|---|---|
| Item precision | 100.0% |
| Item recall | 100.0% |
| Item F1 | 100.0% |
| Total accuracy (±₹1) | 100.0% |
| Reconciliation rate (\|diff\| ≤ ₹1) | 100.0% |
| Mean latency | 11.82 s |

| Receipt | Predicted items | True items | Matched | Total correct | Reconciled | Latency (s) |
|---|---|---|---|---|---|---|
| synthetic-001 | 3 | 3 | 3 | yes | yes | 11.816 |

Method: an item matches when amounts are within ₹1 and normalized names have similarity ≥ 0.6 (1 − Levenshtein / max length), one-to-one, highest similarity first. Precision, recall and F1 are micro-averaged over all items (SPEC R37).
