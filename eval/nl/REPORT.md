# Type-to-add eval

## Answer rate and accuracy when answered (all runs)

"Answered" means the app returned a usable prefill within its limit. **Overall** counts a sentence with no answer as wrong on every field; **when answered** counts only the answered sentences. Computed from each run's saved results file; no run was repeated.

| | Run 1 | Run 2 | Run 3 (main) |
|---|---|---|---|
| Limit | 15 s, no retry | 15 s, one retry | 20 s, one retry after ~1 s |
| **Answer rate** | **86.7%** (26/30) | **90.0%** (27/30) | **80.0%** (24/30) |
| Amount: overall / when answered | 83.3% / 96.2% | 86.7% / 96.3% | 76.7% / 95.8% |
| Payer | 80.0% / 92.3% | 83.3% / 92.6% | 76.7% / 95.8% |
| Participant set | 83.3% / 96.2% | 90.0% / 100.0% | 80.0% / 100.0% |
| Split type | 86.7% / 100.0% | 90.0% / 100.0% | 80.0% / 100.0% |
| **Exact match** | 80.0% / 92.3% | 83.3% / 92.6% | 76.7% / 95.8% |
| Correct abstention (ambiguous) | 71.4% / 71.4% (7 of 7 answered) | 71.4% / 71.4% (7 of 7 answered) | 57.1% / 80.0% (5 of 7 answered) |

## Run 3 (main result)

- Model: `gemini-3.5-flash-lite` · run 2026-10-16T19:35:36.346Z
- Sentences: 30 (7 ambiguous) · by Claude 20, by the human 10

**Eval-setup fixes since run 1 (how the eval calls the app):**

- Q3 (D-30): every failure now records the reason with Gemini's real HTTP status (e.g. model_error 503), and every sentence its predicted values. Run 2's setup is otherwise unchanged: the app's own parse handler, ~2 s between calls.

**Code fixes found by the eval (the app changed):**

- Q2 (D-29): the type-to-add limit rises from 15 s to 20 s, and the single retry now waits about 1 s first. Prompted by the investigation of runs 1-2: all errors were HTTP 503 "high demand", some arriving after 12 s, which left the retry too little time.
- Q1 (D-28): the UI now says "Couldn't read that — try again" with a Try again button. This changes nothing the eval measures.
- Carried over from run 2: P3 (two names for one person in a split leave the split blank).

**Blindness:** Run 3 is NOT blind for P3 (from run 1) or for Q2 (chosen after seeing runs 1-2's failures). The prompt is unchanged since run 1 (P4 not applied); the thinking level stays at the model default (Q4 not applied).

| Metric | Value |
|---|---|
| Amount accuracy | 76.7% |
| Payer accuracy | 76.7% |
| Participant-set accuracy | 80.0% |
| Split-type accuracy | 80.0% |
| Exact match (D-27) | 76.7% |
| Correct abstention (ambiguous) | 57.1% |
| Mean latency | 9.37 s |

| Sentence | Amount | Payer | Participants | Split type | Exact | Abstained | Predicted (amount · payer · participants · split) |
|---|---|---|---|---|---|---|---|
| claude-01 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 600 · Rahul · Aarav, Rahul, Amit · equal |
| claude-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 450 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1200 · Aarav · Aarav, Priya, Sneha · equal |
| claude-04 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (timeout, 20.015 s) |
| claude-05 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 300 · Amit · Aarav, Amit · equal |
| claude-06 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1000 · Sneha · Aarav, Rahul · exact {"Aarav":"400.00","Rahul":"600.00"} |
| claude-07 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 3000 · Aarav · Aarav, Priya, Amit · percent {"Aarav":"50","Priya":"25","Amit":"25"} |
| claude-08 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 3000 · Rahul · Aarav, Priya, Rahul · shares {"Aarav":"1","Priya":"1","Rahul":"2"} |
| claude-09 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (timeout, 20.014 s) |
| claude-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 40 · Amit · Aarav, Amit · equal |
| claude-11 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 899 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-12 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (model_error, Gemini HTTP 503, 4.447 s) |
| claude-13 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1250 · Priya · Priya, Amit · equal |
| claude-14 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 2000 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| claude-15 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 120 · Rahul · Aarav · equal |
| claude-16 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 500 · — · Aarav, Priya · equal |
| claude-17 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 300 · — · Aarav · equal |
| claude-18 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — · Aarav · Aarav, Priya · equal |
| claude-19 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 900 · Rahul · Aarav, Priya · exact |
| claude-20 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | no answer (timeout, Gemini HTTP 503, 20.015 s) |
| human-01 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 300 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · equal |
| human-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 250 · Sneha · Aarav, Priya, Sneha · equal |
| human-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1600 · Amit · Aarav, Priya, Amit · equal |
| human-04 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1000 · Priya · Aarav, Rahul · shares {"Aarav":"1","Rahul":"2"} |
| human-05 | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | 20 · Aarav · Aarav, Priya, Rahul, Amit, Sneha · shares {"Aarav":"2","Priya":"2","Rahul":"1","Amit":"1","Sneha":"1"} |
| human-06 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | no answer (timeout, 20.012 s) |
| human-07 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1500 · Amit · Aarav, Priya, Rahul, Amit, Sneha · equal |
| human-08 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 250 · Sneha · Aarav, Priya, Sneha · equal |
| human-09 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 1000 · Rahul · Rahul · equal |
| human-10 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — | no answer (timeout, 20.008 s) |

## Run 2 (kept exactly as run; `results-run2.json`)

_Run 2's report section, verbatim (it says "main result" because it was the main result then)._

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

## Run 1 (kept exactly as run; `results-run1.json`)

# Type-to-add eval

- Model: `gemini-3.5-flash-lite` · run 2026-10-16T18:36:50.082Z
- Sentences: 30 (7 ambiguous) · by Claude 20, by the human 10

| Metric | Value |
|---|---|
| Amount accuracy | 83.3% |
| Payer accuracy | 80.0% |
| Participant-set accuracy | 83.3% |
| Split-type accuracy | 86.7% |
| Exact match | 80.0% |
| Correct abstention (ambiguous) | 71.4% |
| Mean latency | 5.08 s |

| Sentence | Amount | Payer | Participants | Split type | Exact | Abstained |
|---|---|---|---|---|---|---|
| claude-01 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-04 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-05 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-06 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-07 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| claude-08 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-09 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-10 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| claude-11 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-12 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-13 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-14 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| claude-15 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| claude-16 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| claude-17 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| claude-18 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| claude-19 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| claude-20 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| human-01 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-02 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-03 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-04 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-05 | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| human-06 | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| human-07 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-08 (failed) | ✗ | ✗ | ✗ | ✗ | ✗ | — |
| human-09 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| human-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — |
