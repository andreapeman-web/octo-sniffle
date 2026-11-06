# Question file format

Upload one or more **JSON** or **CSV** files at the start of a session (plus any image files they refer to,
selected together). The upload replaces the previous set. Wrong-answer marks and statistics are kept, matched
by the question's `id`.

**Never include identifiable patient data.** There are no patient fields; the import warns when it sees
something that looks like a name, date of birth or case number.

## JSON

```json
{
  "format": "study-rpg-questions",
  "version": 1,
  "title": "DESA Part 1 — pharmacology",
  "questions": [
    {
      "id": "pharm-001",
      "tags": ["pharmacology", "emergencies"],
      "type": "single",
      "question": "What is the initial IV dose of dantrolene in malignant hyperthermia?",
      "options": ["0.25 mg/kg", "1 mg/kg", "2.5 mg/kg", "10 mg/kg"],
      "answer": "C",
      "explanation": "2.5 mg/kg IV, repeated until the signs settle.",
      "source": "Hausstandard MH 2025, p. 3",
      "difficulty": 2,
      "image": "mh-chart.png"
    }
  ]
}
```

A bare array of questions (`[ {...}, {...} ]`) is also accepted.

| Field | Required | Meaning |
|---|---|---|
| `id` | strongly recommended | Unique, stable id. Marks and statistics follow it across uploads. Without an id, a fingerprint of the question text is used, so editing the text loses its history. |
| `tags` | no | Topics, used for filtering and per-topic statistics. `"topic": "x"` also works. Missing → `untagged`. |
| `type` | no | `single` (one correct option), `multi` (one or more), `truefalse`, `typed` (free text). If omitted: no options → `typed`, boolean answer → `truefalse`, otherwise `single`. |
| `question` | **yes** | Question text. See *Formatting* below. |
| `options` | for single/multi | At least two. Not needed for `truefalse` or `typed`. |
| `answer` | **yes** | `single`: a letter (`"B"`) or the exact option text. `multi`: `["A","C"]` or `"A;C"`. `truefalse`: `true`/`false`. `typed`: the reference answer text the AI compares against. Numbers (`1`) are rejected because 0- vs 1-based is ambiguous. |
| `explanation` | no | Shown after answering. If missing, the AI may explain only when confident, clearly labelled. |
| `source` | no | Where the question comes from (shown under the answer). |
| `difficulty` | no | Number, e.g. 1–5 (stored, not yet used for selection). |
| `image` | no | File name of an image selected together with the file, a `data:` URI, or a web URL (web URLs don't work offline). Images are resized to max 2000 px and compressed. |

## CSV

First row is the header; columns in any order; `,` or `;` as separator (detected automatically). Quote fields
that contain the separator, quotes or line breaks (`"like ""this"""`).

| Column | Notes |
|---|---|
| `id`, `type`, `question`, `answer`, `explanation`, `source`, `difficulty`, `image` | as above |
| `tags` | separated by `|` or `;` |
| `options` | separated by `|` |
| `answer` for `multi` | `A;C` (quote it if the file uses `;` as separator) |

```csv
id,tags,type,question,options,answer,explanation
ph-002,pharmacology|airway,single,Rocuronium dose for RSI?,0.3 mg/kg|0.6 mg/kg|1.0–1.2 mg/kg,C,Gives intubating conditions in about 60 s.
ph-003,pharmacology,multi,Which does sugammadex reverse?,Rocuronium|Vecuronium|Cisatracurium,A;B,
ph-004,physiology,typed,Normal anatomical dead space in a 70 kg adult?,,About 150 mL (2 mL/kg),
```

Excel: *Save As → CSV UTF-8* keeps µ, ₂, ≥ and accents intact.

## Formatting inside text

Text is shown **exactly as written** — no rounding, unit conversion or auto-formatting of doses.

- Line breaks are kept; a blank line starts a new paragraph.
- `**bold**` and `*italic*`.
- Tables (lab values etc.) in Markdown pipe syntax:

```
| Parameter | Value |
|---|---|
| pH | 7.25 |
| PaCO₂ | 60 mmHg |
```

In JSON, write line breaks as `\n`.

## The check report

Before importing, the app lists:

- **Errors** (item skipped): missing question text, missing answer, answer letter that doesn't match an option,
  numeric answers, unknown type, fewer than two options, duplicate id (also across files).
- **Warnings** (item imported): same question text twice, duplicate option text, possible patient data,
  missing image files, web images.

You can import the valid questions straight away or fix the file and upload again.
