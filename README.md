# Study RPG

A personal study game. You fight through a fantasy adventure by answering **your own** exam questions:
a correct answer is your hit, a wrong answer is the monster's hit, and every wrong answer is marked and comes
back for review until you get it right in a mock combat.

It is a Progressive Web App (PWA): one codebase that runs in the browser on iPhone, iPad and Windows, installs to
the Home Screen, and works offline. Progress is saved on the device after every answer, and one backup file moves
everything between devices.

> **Status: MVP slice 1** — playable core plus AI Dungeon Master narration. PDF adventure import and image
> generation are the next slices (see [Roadmap](#roadmap)).

## What works now

| Area | Done |
|---|---|
| Question upload | JSON or CSV, several files at once plus their images; check report (missing answers, bad answer letters, duplicates, possible patient data) before import; replaces the previous set; marks and stats are kept |
| Topics | Choose tags before a session and between fights |
| Combat | Monster HP and damage from the stat block (fixed averages, no dice); player damage, HP and levels from `public/levels.json`; XP only when a monster dies; difficulty slider 25–100 % for monster damage |
| Stat blocks | Shown in a panel with the source (e.g. 5e SRD); you can edit HP, damage and XP |
| Knock-out | At 0 HP you wake in a safe place; the monster's HP is restored |
| Rest | HP only recovers in a safe place through mock combats: marked questions only (random ones if none are marked), +1 HP per correct answer, the mark clears |
| Spaced repetition | Marked questions return in fights; Leitner boxes schedule reviews |
| Typed answers | The AI compares your answer with the reference answer from your file; you can disagree. Offline you grade yourself against the reference answer |
| Explanations | Always from your file. If the file has none and you were wrong, the AI explains only when confident, labelled *"AI explanation, not from your question file"*, or says it can't explain reliably |
| AI DM | 3–6 sentence narration per stop, monster introductions, hit/miss lines; next stop generated in advance; cached on the device; skippable; falls back to the adventure's own text |
| Character | Name, uploaded portrait, level, XP, HP; portrait upgrade prompt and level history; cosmetic badges (boss, location, chapter, level, streak, flawless fight, 100 correct) |
| Screens | Home, story map, battle, results, rest, review, stats per topic with weak areas, character, settings |
| Data | IndexedDB; questions loaded one at a time; images stored separately, resized and compressed on import; persistent-storage request; storage usage by category; backup reminder after 7 days; single-file export/import |
| Library | Several adventures, each with its own save; adventures can be imported as JSON |

Measured with 20,000 questions and 2,000 images (≈255 MB) on a phone-sized viewport with the CPU slowed 4×:
app opens in ≈0.25 s, a fight starts in ≈0.3 s, validating a 20,000-question file takes ≈1.2 s and importing it ≈4.4 s.
Re-run with `npm run gen:bench` and the steps in `docs/benchmark.md`.

## Run, build, deploy

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (question parsing + game rules)
npm run build      # static site in dist/
npm run preview    # serve dist/ like production
```

**Hosting (GitHub Pages).** Push to `main`; `.github/workflows/deploy.yml` tests, builds and publishes `dist/`.
In the repository settings choose *Pages → Source: GitHub Actions*. The app uses relative paths, so it works
under `https://<user>.github.io/<repo>/`. GitHub Pages on a private repository needs a paid GitHub plan; the
code holds no personal content, so a public repository is fine. Your questions never go into the repository.

**Install on iPhone/iPad:** open the site in Safari → Share → *Add to Home Screen*.
**Install on Windows:** open it in Chrome or Edge → install icon in the address bar.

## The AI proxy (optional)

The game works fully without AI. To turn on the AI Dungeon Master, typed-answer checking and explanations,
deploy the small Cloudflare Worker in `proxy/` (free plan is enough). It keeps your Anthropic API key off the device.

```bash
cd proxy
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # your key from console.anthropic.com
npx wrangler secret put APP_TOKEN           # any long random password
# edit wrangler.toml: ALLOWED_ORIGINS = "https://<user>.github.io"
npx wrangler deploy
```

Then in the app: **Settings → AI Dungeon Master**, paste the Worker URL and the same `APP_TOKEN`, and press *Save & test*.

What is sent to the AI: adventure text for narration, and the question, options, reference answer and your typed
answer for checking/explanations. Nothing else (no statistics, no images, no patient data — the question format has no patient fields).

### Cost estimate

The proxy uses Claude Opus 5.5 by default ($4 / $20 per million input/output tokens). Estimates, not measurements:

| Call | When | Approx. cost |
|---|---|---|
| Narration of a stop (plus intros and 12 hit/miss lines) | once per stop, then cached | ≈ $0.02 |
| Rest / knock-out narration | each rest | ≈ $0.01 |
| Typed-answer check | each typed answer that isn't an exact match | ≈ $0.01 |
| Explanation | wrong answer with no explanation in the file | ≈ $0.02–0.03 |

The 9-stop sample adventure costs roughly **$0.20–0.50** in narration. A full published module with 40–60 fights
would be about **$1–2**, plus answer checks and explanations, depending on how you study. To spend much less,
set `MODEL = "claude-haiku-5-5"` in `proxy/wrangler.toml` (roughly 40× cheaper, simpler prose).

## How to add content

- **Questions:** write JSON or CSV as described in [`docs/question-format.md`](docs/question-format.md), then
  *Upload questions* in the app. A 30-question sample is bundled (`public/sample-questions.json`).
- **Adventures:** until PDF import arrives, an adventure is a JSON file ([`docs/adventure-format.md`](docs/adventure-format.md));
  import it from *Start an adventure*. The sample is `public/adventures/lantern-of-saint-quell.json`.
- **Character progression:** edit `public/levels.json` (XP thresholds, max HP, damage per level) and redeploy.
- **Art:** tap 🖼 on any monster or location to use your own picture; otherwise a placeholder is shown.

## iOS notes

- Safari can delete website data after weeks without use or when the device is short of space. The app asks for
  persistent storage and shows whether it was granted; installing to the Home Screen helps. **Export a backup
  regularly** (the app reminds you after 7 days) and keep it in iCloud Drive.
- Chrome on iPhone/iPad uses Safari's engine and cannot install PWAs; use Safari to add it to the Home Screen.
- The Home Screen app and Safari keep **separate** storage. Pick one and stick to it, or move data with a backup.
- Storage on iOS is typically limited to a share of free disk space; 20,000 questions plus 2,000 compressed images
  used about 255 MB in testing.

## Project layout

```
src/lib/parse.ts       question file parsing + validation (pure, tested)
src/lib/engine.ts      game rules (pure, tested)
src/lib/questions.ts   question pool, spaced repetition, marks, stats, streak
src/lib/ai.ts          proxy client with offline fallbacks and narration cache
src/lib/backup.ts      export/import, storage report
src/screens/           one file per screen
proxy/                 Cloudflare Worker (Anthropic API)
public/                levels.json, sample questions, sample adventure, icons
```

## Roadmap

1. **PDF adventure import (next).** Spike on your own PDF first: extraction of locations, encounters, NPCs and stat
   blocks in story order into the adventure JSON above, with an editable checklist before play. Main risk:
   multi-column layouts, scanned pages and stat-block tables.
2. **Missing stat blocks** looked up in the 5e SRD (with source shown and editable).
3. **Images:** asset checklist, shared style guide, generation via Gemini image models through the proxy, portrait
   upgrades on level-up using the previous portrait as reference.

## Licences

See [`docs/licenses.md`](docs/licenses.md). All dependencies are free/open source. Monster statistics in the sample
adventure come from the 5e SRD 5.1 (CC-BY-4.0).
