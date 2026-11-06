# Performance check

Target from the brief: app opens in < 2 s and a fight starts in < 1 s with 20,000 questions and 2,000 images
stored, on a mid-range phone.

1. `npm run build && npm run preview`
2. `node scripts/gen-bench-pack.mjs 20000 > bench.json`
3. In the app: *Upload questions* → choose `bench.json` → import.
4. Images: the automated run (Playwright, Chromium, Pixel 5 viewport, CPU throttled 4×) wrote 2,000
   900×600 JPEGs (~60 KB each) straight into the image store and attached them to questions.

Result (6 Nov 2026):

| Measure | Result |
|---|---|
| Validate 20,000-question file | 1.2 s |
| Import 20,000 questions | 4.4 s |
| Storage used | ≈ 255 MB |
| App open (reload → home ready) | 0.19–0.26 s |
| Fight start (tap → question shown) | 0.28–0.37 s |

Why it stays fast: only the list of question keys for the selected topics is loaded (from an index); each
question is read from IndexedDB when it is asked; images are separate records loaded only when shown.
Real-device checks on iPhone, iPad and Windows are still part of acceptance.
