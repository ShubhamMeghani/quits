# Type-to-add evaluation (SPEC R66, R67)

This folder holds about 30 sentences, each with its group context and the expected result:

- **Written by Claude:** 20 sentences (`claude-01` … `claude-20`), five of them deliberately ambiguous (`claude-16` … `claude-20`).
- **Written by the human:** about 10 sentences in your own words, saved as `human-01.json` … `human-10.json`.

Before the eval is run, **every** file is reviewed by the human; set `"reviewed": true` once checked.

## File format

```json
{
  "id": "human-01",
  "text": "Rahul paid 600 for pizza, split with Amit and me",
  "members": ["Aarav", "Priya", "Rahul", "Amit", "Sneha"],
  "me": "Aarav",
  "today": "2026-10-17",
  "baseCurrency": "INR",
  "author": "human",
  "reviewed": true,
  "ambiguous": false,
  "blank": [],
  "expected": {
    "amount": 600,
    "currency": "INR",
    "payer": "Rahul",
    "participants": ["Rahul", "Amit", "Aarav"],
    "split_type": "equal",
    "split_values": null,
    "category": "Food & Drinks",
    "date": null,
    "description": null
  }
}
```

### Rules for the expected values

- Names are exactly as in `members`. `me` is the speaker.
- **Participants include the payer** unless the text excludes them, e.g. "only for me" / "sirf mere liye" (SPEC D-21).
- `participants: null` means the participants should be left blank.
- `amount` is in major units. `null` means no amount was stated, so it should be left blank.
- `split_values` is only for `exact` (amounts), `percent` (numbers adding to 100) and `shares` (integers). Use `null` when the split should be left blank, or when the split is equal.
- Relative dates ("yesterday", "on Friday") are resolved from `today`.
- **Ambiguous sentences:** set `"ambiguous": true` and list in `"blank"` the fields that must stay blank. Fields that can be listed:
  - `payer`
  - `amount`
  - `participants`
  - `split`
  - `date`
  - `category`

  Examples: two members share the name, an unknown person is named, or the exact amounts don't add up.

## Run

```bash
npm run eval:nl -- --check   # validates every file; no model calls
npm run eval:nl              # runs the model and writes results.json + REPORT.md
```

**What is scored:**

- **Field accuracy:** amount, payer, participant set and split type.
- **Exact match:** all four fields are correct, plus the split values when the expected file gives them.
- **Correct abstention:** on ambiguous sentences, every field listed in `blank` was left blank.

`/about` shows the committed `results.json`. The targets (amount ≥ 95%, exact match ≥ 80%) are Should (R67).
