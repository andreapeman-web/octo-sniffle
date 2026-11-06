# Adventure file format

Story text lives in data, not code. Until PDF import exists, an adventure is a JSON file imported from
*Start an adventure → Import adventure file*. The PDF importer (next phase) will produce this same format and
let you edit it as a checklist before playing. Full example: `public/adventures/lantern-of-saint-quell.json`.

```json
{
  "format": "study-rpg-adventure",
  "version": 1,
  "id": "my-module",
  "title": "My Module",
  "recommendedLevel": 1,
  "styleGuide": "Dark fantasy, painterly…",
  "synopsis": "One paragraph the AI DM uses as context.",
  "intro": "Shown before the first stop.",
  "ending": "Shown (or retold by the AI) at the end.",
  "chapters": [{ "id": "c1", "title": "Chapter 1: …" }],
  "safePlaces": [{ "id": "temple", "name": "Temple of …", "description": "…" }],
  "monsters": {
    "goblin": {
      "id": "goblin", "name": "Goblin", "hp": 7, "ac": 15, "hitDamage": 5, "xp": 50, "cr": "1/4",
      "attacks": [{ "name": "Scimitar", "damage": 5, "text": "+4 to hit, 5 (1d6 + 2) slashing" }],
      "source": "5e SRD 5.1 (CC-BY-4.0)", "icon": "👺", "description": "…"
    }
  },
  "stops": [
    {
      "id": "s1", "chapterId": "c1",
      "location": "Hollowmere Gate", "locationId": "hollowmere-gate",
      "description": "Short description for the DM.",
      "narration": "Fallback narration used offline (3–6 sentences, from the module).",
      "safePlaceId": "temple",
      "encounter": { "id": "e1", "name": "Goblin raiders", "boss": false, "monsters": [{ "monsterId": "goblin", "count": 3 }] }
    }
  ],
  "hitLines": ["…"],
  "missLines": ["…"],
  "credits": "…"
}
```

Rules:

- Stops are played in order; every stop is one fight. Several stops can share a `locationId`.
- `hitDamage` is the damage per wrong answer: the fixed average of the monster's attack (or multiattack) from
  its stat block, before the difficulty multiplier.
- `count` monsters are fought one after another; each awards its `xp` when defeated.
- `safePlaceId` is where you rest or wake up after a knock-out at that stop.
- The character starts at `recommendedLevel`.
