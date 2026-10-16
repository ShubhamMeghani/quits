## Run 2 (main result)

- Model: `gemini-3.5-flash-lite` · run 2026-10-16T18:47:11.794Z
- Sentences: 30 (7 ambiguous) · by Claude 20, by the human 10

**Eval-setup fixes since run 1 (how the eval calls the app):**

- P1: each sentence goes through the app's own parse handler (same prompt, schema, model and post-processing, 15 s deadline, one retry on a transient model error), with ~2 s between calls. Run 1 called Gemini directly, without the app's retry, back-to-back.

**Code fixes found by the eval (the app changed):**

- P3: two names for the same person in one split (e.g. "me" and "Aarav") now leave the split blank instead of being added together. Found by the eval (human-05 in run 1).

**Blindness:** Run 2 is NOT blind for P3: that fix was made after seeing run 1's result on human-05. P1 changes how the eval calls the app, not the app. The prompt is unchanged since run 1 (P4 was not applied).

| Metric | Value |
|---|---|
| Amount accuracy | 86.7% |
| Payer accuracy | 83.3% |
| Participant-set accuracy | 90.0% |
| Split-type accuracy | 90.0% |
| Exact match (D-27) | 83.3% |
| Correct abstention (ambiguous) | 71.4% |
| Mean latency | 6.28 s |

| Sentence | Amount | Payer | Participants | Split type | Exact | Abstained | Predicted (amount · payer · participants · split) |
|---|---|---|---|---|---|---|---|
| claude-01 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (502 timeout) |
| claude-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 450 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1200 · Aarav · Aarav, Priya, Sneha · equal |
| claude-04 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 999 · Priya · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-05 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 300 · Amit · Aarav, Amit · equal |
| claude-06 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1000 · Sneha · Aarav, Rahul · exact {"Aarav":"400.00","Rahul":"600.00"} |
| claude-07 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 3000 · Aarav · Aarav, Priya, Amit · percent {"Aarav":"50","Priya":"25","Amit":"25"} |
| claude-08 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 3000 · Rahul · Aarav, Priya, Rahul · shares {"Aarav":"1","Priya":"1","Rahul":"2"} |
| claude-09 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 750 · Priya · Aarav, Priya, Sneha · equal |
| claude-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 40 · Amit · Aarav, Amit · equal |
| claude-11 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 899 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-12 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 500 · Sneha · Rahul, Sneha · equal |
| claude-13 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1250 · Priya · Priya, Amit · equal |
| claude-14 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 2000 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-15 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (502 model_error) |
| claude-16 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 500 · — · Aarav, Priya · equal |
| claude-17 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 300 · — · Aarav · equal |
| claude-18 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — · Aarav · Aarav, Priya · equal |
| claude-19 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 900 · Rahul · Aarav, Priya · exact |
| claude-20 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 450 · — · Aarav, Amit · equal |
| human-01 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 300 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| human-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 250 · Sneha · Aarav, Priya, Sneha · equal |
| human-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1600 · Amit · Aarav, Priya, Amit · equal |
| human-04 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1000 · Priya · Aarav, Rahul · shares {"Aarav":"1","Rahul":"2"} |
| human-05 | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | — · Aarav · Aarav, Priya, Rahul, Amit, Sneha · shares |
| human-06 | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | — · Aarav · — · equal |
| human-07 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1500 · Amit · Aarav, Priya, Rahul, Amit, Sneha · equal |
| human-08 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 250 · Sneha · Aarav, Priya, Sneha · equal |
| human-09 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (502 timeout) |
| human-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 200 · Aarav · Aarav, Sneha · equal |
