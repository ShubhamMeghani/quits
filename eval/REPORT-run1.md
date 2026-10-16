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
