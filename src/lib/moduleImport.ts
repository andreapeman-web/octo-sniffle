// Turns an adventure module PDF into a playable Adventure:
//   1. pdf.js reads the text layer (scanned pages are read by Claude from page images);
//   2. Claude extracts locations, encounters, stat blocks, NPCs, safe places and
//      illustrations from each part of the book;
//   3. Claude merges the parts into one ordered run in this game's format.
// The result is checked and repaired here, then shown to the player as an editable outline.
import { askJson, imageLimit } from "./claudeAi";
import { readPdf, renderPage, type PdfPage } from "./pdf";
import { mapFor } from "../art/MapView";
import { TERRAINS } from "../art/scenes";
import { SPRITES } from "../art/sprites";
import type { Adventure, Monster, SafePlace, Stop } from "./types";

export interface ImportStep {
  label: string;
  done: number;
  total: number;
}

interface ChunkResult {
  title?: string;
  recommendedLevel?: number;
  locations?: { name: string; description?: string; page?: number }[];
  encounters?: { location: string; name: string; monsters: { name: string; count: number }[]; boss?: boolean; page?: number }[];
  statBlocks?: { name: string; hp: number; ac?: number; cr?: string; xp?: number; attacks?: { name: string; damage: number; text?: string }[]; damagePerRound?: number; page?: number }[];
  npcs?: { name: string; role?: string }[];
  safePlaces?: { name: string; description?: string }[];
  beats?: string[];
  illustrations?: { subject: string; page: number }[];
}

interface MergedAdventure {
  title: string;
  recommendedLevel: number;
  synopsis: string;
  intro: string;
  ending: string;
  chapters: { id: string; title: string }[];
  safePlaces: { id: string; name: string; description: string; terrain?: string }[];
  locations: { id: string; name: string; terrain?: string }[];
  monsters: { id: string; name: string; hp: number; ac?: number; cr?: string; xp: number; hitDamage: number; attacks?: { name: string; damage: number; text?: string }[]; source: string; description?: string; sprite?: string }[];
  stops: { chapterId: string; locationId: string; description: string; narration: string; safePlaceId: string; encounter: { name: string; boss?: boolean; monsters: { monsterId: string; count: number }[] } }[];
  npcs?: { name: string; role?: string }[];
  illustrations?: { subject: string; page: number; assetKey?: string }[];
  hitLines?: string[];
  missLines?: string[];
}

const CHUNK_CHARS = 45_000;

const CHUNK_PROMPT = (part: number, parts: number, text: string) => `You are reading part ${part} of ${parts} of a Dungeons & Dragons adventure module that the user owns and is using privately for a study game. Page numbers are marked like [p12].

Extract, in the order they happen in the story:
- locations: every place the characters visit (name, one-sentence description, page);
- encounters: every fight, with its location name, a short name, the monsters and how many of each, and boss: true for a major villain or climax fight;
- statBlocks: every creature stat block printed in this text: name, hit points (the number), armour class, challenge rating, XP, attacks with their AVERAGE damage as printed (the number before the dice), and damagePerRound (total average damage of its Multiattack, if it has one);
- npcs: important non-player characters (name, role);
- safePlaces: temples, churches, inns, shrines or other places where characters can rest safely;
- beats: the main plot events, one short sentence each;
- illustrations: pictures or maps the text refers to, or captions you can see (subject, page);
- title and recommendedLevel if this part states them.
Do not invent anything that is not in the text. Leave a list empty if nothing applies.

Reply with only this JSON object:
{"title": string|null, "recommendedLevel": number|null, "locations": [{"name": string, "description": string, "page": number}], "encounters": [{"location": string, "name": string, "monsters": [{"name": string, "count": number}], "boss": boolean, "page": number}], "statBlocks": [{"name": string, "hp": number, "ac": number, "cr": string, "xp": number, "attacks": [{"name": string, "damage": number, "text": string}], "damagePerRound": number|null, "page": number}], "npcs": [{"name": string, "role": string}], "safePlaces": [{"name": string, "description": string}], "beats": [string], "illustrations": [{"subject": string, "page": number}]}

TEXT:
${text}`;

const MERGE_PROMPT = (parts: ChunkResult[], fileName: string) => `Below are notes extracted, part by part, from a Dungeons & Dragons adventure module ("${fileName}") that the user owns. Build a single-player study game run from them.

The game: the hero travels in a FIXED order from fight to fight (no choices), with a short narration between fights. Every location and every monster in the notes must be faced at least once, in story order. Fights are won by answering exam questions; monster stats come from stat blocks.

Rules:
- One stop = one fight at one location. Several stops may share a location. A location with no fight is folded into the narration of the next stop.
- Group stops into chapters following the module's structure (2-8 chapters).
- monsters: one entry per creature type. Use the module's own stat block when the notes have one (source "Module p.N"). If not, and the creature is in the free 5e System Reference Document 5.1 and you are sure of its numbers, use those (source "5e SRD 5.1 — filled in by Claude, please check"). Otherwise estimate sensibly for its challenge and say so (source "Estimated — no stat block found, please check"). hp = hit points, hitDamage = average damage of its main attack, or of its Multiattack total if it has one; xp = its XP value.
- sprite: the closest of ${Object.keys(SPRITES).filter((k) => !["hero", "tome"].includes(k)).join(", ")} ("shade" if none fits).
- terrain for each location and safe place: the closest of ${TERRAINS.join(", ")}.
- safePlaces: from the notes; if none, invent one plausible generic temple or inn near the start. Every stop names the nearest safe place.
- narration: 2-4 sentences, second person, based on the module, of what the hero does on the way to this stop.
- recommendedLevel: the module's starting level (1 if unknown).
- ids: short lowercase slugs (letters, digits, hyphens).
- illustrations: keep the ones that show a monster, location or map, with assetKey "monster:<id>", "location:<id>", "safe:<id>" or "map:main".
- hitLines / missLines: 6 short generic lines each, for the hero landing a blow / being hit, fitting this module's tone.
Keep every text short. Do not add places, monsters or plot that are not in the notes (except a safe place if none exists).

Reply with only this JSON object:
{"title": string, "recommendedLevel": number, "synopsis": string, "intro": string, "ending": string,
 "chapters": [{"id": string, "title": string}],
 "safePlaces": [{"id": string, "name": string, "description": string, "terrain": string}],
 "locations": [{"id": string, "name": string, "terrain": string}],
 "monsters": [{"id": string, "name": string, "hp": number, "ac": number, "cr": string, "xp": number, "hitDamage": number, "attacks": [{"name": string, "damage": number, "text": string}], "source": string, "description": string, "sprite": string}],
 "stops": [{"chapterId": string, "locationId": string, "description": string, "narration": string, "safePlaceId": string, "encounter": {"name": string, "boss": boolean, "monsters": [{"monsterId": string, "count": number}]}}],
 "npcs": [{"name": string, "role": string}],
 "illustrations": [{"subject": string, "page": number, "assetKey": string}],
 "hitLines": [string], "missLines": [string]}

NOTES:
${JSON.stringify(parts)}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";

export class ImportCancelled extends Error {}

/** Run the whole import. Throws {code,message} from Claude, or ImportCancelled. */
export async function importModule(
  file: File,
  onStep: (s: ImportStep) => void,
  signal: AbortSignal,
): Promise<{ adventure: Adventure; pdf: unknown; warnings: string[] }> {
  const warnings: string[] = [];
  const check = () => {
    if (signal.aborted) throw new ImportCancelled("cancelled");
  };

  onStep({ label: "Reading the PDF", done: 0, total: 1 });
  const { pages, doc } = await readPdf(file, (done, total) => onStep({ label: "Reading the PDF", done, total }));
  check();

  // Scanned pages: Claude reads the page images.
  const scanned = pages.filter((p) => p.scanned);
  if (scanned.length) {
    const per = Math.min(4, await imageLimit());
    if (per <= 0) warnings.push(`${scanned.length} page(s) look scanned and could not be read (images can't be sent to Claude in this view).`);
    else if (scanned.length > 120) warnings.push(`${scanned.length} pages look scanned; only the first 120 were read.`);
    const todo = scanned.slice(0, 120);
    for (let i = 0; per > 0 && i < todo.length; i += per) {
      check();
      onStep({ label: "Reading scanned pages", done: i, total: todo.length });
      const batch = todo.slice(i, i + per);
      const images = await Promise.all(batch.map((p) => renderPage(doc, p.n)));
      try {
        const out = await askJson<{ pages: { page: number; text: string }[] }>(
          `These images are pages ${batch.map((p) => p.n).join(", ")} of a D&D adventure module the user owns. Transcribe the text of each page in reading order (columns left to right). Include stat blocks. Reply with only {"pages": [{"page": number, "text": string}]}.`,
          { tier: "default", images, signal },
        );
        for (const o of out.pages ?? []) {
          const pg = pages.find((p) => p.n === Number(o.page));
          if (pg && typeof o.text === "string") pg.text = o.text;
        }
      } catch (e) {
        if ((e as { code?: string }).code === "cancelled") throw new ImportCancelled("cancelled");
        warnings.push(`Pages ${batch.map((p) => p.n).join(", ")} could not be read.`);
      }
    }
  }

  // Chunk the book.
  const chunks: string[] = [];
  let cur = "";
  for (const p of pages as PdfPage[]) {
    const block = `[p${p.n}]\n${p.text}\n`;
    if (cur.length + block.length > CHUNK_CHARS && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += block.slice(0, CHUNK_CHARS);
  }
  if (cur.trim()) chunks.push(cur);
  if (!chunks.length || chunks.join("").replace(/\[p\d+\]|\s/g, "").length < 200) {
    throw { code: "no_text", message: "No readable text was found in this PDF." };
  }

  const parts: ChunkResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    check();
    onStep({ label: "Claude is reading the module", done: i, total: chunks.length });
    try {
      parts.push(await askJson<ChunkResult>(CHUNK_PROMPT(i + 1, chunks.length, chunks[i]), { tier: "default", signal }));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "cancelled") throw new ImportCancelled("cancelled");
      if (code === "invalid_json" || code === "refused" || code === "empty_completion") {
        warnings.push(`Part ${i + 1} of ${chunks.length} could not be read and was skipped.`);
        continue;
      }
      throw e;
    }
  }
  onStep({ label: "Claude is reading the module", done: chunks.length, total: chunks.length });
  check();

  onStep({ label: "Claude is building your adventure", done: 0, total: 1 });
  const merged = await askJson<MergedAdventure>(MERGE_PROMPT(parts, file.name), { tier: "complex", signal });
  onStep({ label: "Claude is building your adventure", done: 1, total: 1 });

  const adventure = normalise(merged, file.name, warnings);
  return { adventure, pdf: doc, warnings };
}

/** Repair and complete Claude's draft so the game can always play it. */
export function normalise(m: MergedAdventure, fileName: string, warnings: string[]): Adventure {
  const title = String(m.title || fileName.replace(/\.pdf$/i, ""));
  const id = `${slug(title)}-${Date.now().toString(36)}`;
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

  const monsters: Record<string, Monster> = {};
  for (const x of m.monsters ?? []) {
    if (!x?.name) continue;
    const mid = slug(x.id || x.name);
    const attacks = (x.attacks ?? []).filter((a) => a?.name).map((a) => ({ name: String(a.name), damage: Math.max(0, num(a.damage, 0)), text: a.text ? String(a.text) : undefined }));
    monsters[mid] = {
      id: mid,
      name: String(x.name),
      hp: Math.max(1, Math.round(num(x.hp, 10))),
      ac: x.ac !== undefined ? num(x.ac, 10) : undefined,
      cr: x.cr !== undefined ? String(x.cr) : undefined,
      xp: Math.max(0, Math.round(num(x.xp, 10))),
      hitDamage: Math.max(1, Math.round(num(x.hitDamage, attacks[0]?.damage ?? 4))),
      attacks: attacks.length ? attacks : [{ name: "Attack", damage: Math.max(1, Math.round(num(x.hitDamage, 4))) }],
      source: String(x.source || "Estimated — please check"),
      description: x.description ? String(x.description) : undefined,
      sprite: x.sprite && SPRITES[x.sprite] ? x.sprite : undefined,
    };
  }

  const safePlaces: SafePlace[] = (m.safePlaces ?? []).filter((s) => s?.name).map((s) => ({ id: slug(s.id || s.name), name: String(s.name), description: String(s.description ?? "") }));
  if (!safePlaces.length) {
    safePlaces.push({ id: "sanctuary", name: "A quiet sanctuary", description: "A small chapel where travellers may rest." });
    warnings.push("The module named no safe place, so a generic sanctuary was added.");
  }
  const safeIds = new Set(safePlaces.map((s) => s.id));

  const chapters = (m.chapters ?? []).filter((c) => c?.title).map((c) => ({ id: slug(c.id || c.title), title: String(c.title) }));
  if (!chapters.length) chapters.push({ id: "c1", title: "Chapter 1" });
  const chapterIds = new Set(chapters.map((c) => c.id));

  const locName = new Map((m.locations ?? []).map((l) => [slug(l.id || l.name), String(l.name)]));
  const stops: Stop[] = [];
  (m.stops ?? []).forEach((s, i) => {
    const mons = (s.encounter?.monsters ?? [])
      .map((g) => ({ monsterId: slug(String(g.monsterId)), count: Math.max(1, Math.min(12, Math.round(num(g.count, 1)))) }))
      .filter((g) => monsters[g.monsterId]);
    if (!mons.length) {
      warnings.push(`Stop ${i + 1} had no known monster and was left out.`);
      return;
    }
    const locationId = slug(s.locationId || `loc-${i}`);
    stops.push({
      id: `s${stops.length + 1}`,
      chapterId: chapterIds.has(slug(s.chapterId)) ? slug(s.chapterId) : chapters[0].id,
      location: locName.get(locationId) ?? s.locationId ?? `Location ${i + 1}`,
      locationId,
      description: String(s.description ?? ""),
      narration: String(s.narration ?? s.description ?? ""),
      safePlaceId: safeIds.has(slug(s.safePlaceId)) ? slug(s.safePlaceId) : safePlaces[0].id,
      encounter: { id: `e${stops.length + 1}`, name: String(s.encounter?.name || "A fight"), boss: !!s.encounter?.boss, monsters: mons },
    });
  });
  if (!stops.length) throw { code: "no_stops", message: "Claude could not find any fights in this module." };

  // Monsters never faced are added as extra fights at their first plausible place (the last stop's location).
  const used = new Set(stops.flatMap((s) => s.encounter.monsters.map((g) => g.monsterId)));
  for (const mon of Object.values(monsters)) {
    if (used.has(mon.id)) continue;
    const last = stops[stops.length - 1];
    stops.splice(stops.length - 1, 0, { ...last, id: `s${stops.length + 1}`, encounter: { id: `e${stops.length + 1}`, name: mon.name, monsters: [{ monsterId: mon.id, count: 1 }] }, narration: last.narration });
    warnings.push(`${mon.name} had no fight of its own, so one was added near the end; move or remove it in the outline.`);
  }

  stops.forEach((s, i) => {
    s.id = `s${i + 1}`;
    s.encounter.id = `e${i + 1}`;
  });

  const adv: Adventure = {
    format: "study-rpg-adventure",
    version: 1,
    id,
    title,
    author: `Imported from ${fileName}`,
    recommendedLevel: Math.max(1, Math.min(20, Math.round(num(m.recommendedLevel, 1)))),
    synopsis: String(m.synopsis ?? ""),
    intro: String(m.intro ?? ""),
    ending: String(m.ending ?? ""),
    chapters,
    safePlaces,
    monsters,
    stops,
    hitLines: m.hitLines?.length ? m.hitLines.map(String) : ["Your strike lands true.", "You find an opening and take it."],
    missLines: m.missLines?.length ? m.missLines.map(String) : ["The blow catches you off guard.", "Pain flares as it strikes."],
    credits: `Adventure content from your own copy of ${fileName}, for private use.`,
  };

  // Map layout, with Claude's terrain choices.
  const map = mapFor(adv);
  const terr = new Map((m.locations ?? []).map((l) => [slug(l.id || l.name), l.terrain]));
  for (const [lid, loc] of Object.entries(map.locations)) {
    const t = terr.get(lid);
    if (t && (TERRAINS as string[]).includes(t)) loc.terrain = t;
  }
  map.safePlaces = Object.fromEntries((m.safePlaces ?? []).map((s) => [slug(s.id || s.name), { terrain: (TERRAINS as string[]).includes(s.terrain ?? "") ? s.terrain : "temple" }]));
  adv.map = map;

  // Where the module has art for each asset.
  const notes: Record<string, string> = {};
  for (const il of m.illustrations ?? []) {
    if (!il?.assetKey || !il.page) continue;
    notes[il.assetKey] = notes[il.assetKey] ? `${notes[il.assetKey]}, p. ${il.page}` : `Module art: p. ${il.page} (${il.subject})`;
  }
  adv.artNotes = notes;
  adv.npcs = (m.npcs ?? []).filter((n) => n?.name).map((n) => ({ name: String(n.name), role: n.role ? String(n.role) : undefined }));
  return adv;
}

// ---------- art checklist ----------

export type AssetKind = "hero" | "monster" | "location" | "safe" | "map";

export interface AssetItem {
  kind: AssetKind;
  id: string;
  name: string;
  hint: string;
  note?: string;
}

export function assetList(adv: Adventure): AssetItem[] {
  const n = adv.artNotes ?? {};
  const out: AssetItem[] = [
    { kind: "hero", id: "battle", name: "Your hero in battle", hint: "Your character seen from behind or from the side, full body. A PNG with a transparent background looks best." },
    { kind: "map", id: "main", name: "Adventure map", hint: "The module's overland or area map. After uploading, tap it to place each location.", note: n["map:main"] },
  ];
  for (const m of Object.values(adv.monsters)) {
    out.push({ kind: "monster", id: m.id, name: m.name, hint: "Full body, facing left if possible. A PNG with a transparent background looks best; other pictures get a soft vignette.", note: n[`monster:${m.id}`] });
  }
  const seen = new Set<string>();
  for (const s of adv.stops) {
    if (seen.has(s.locationId)) continue;
    seen.add(s.locationId);
    out.push({ kind: "location", id: s.locationId, name: s.location, hint: "A wide landscape scene of the place (it fills the battle background).", note: n[`location:${s.locationId}`] });
  }
  for (const p of adv.safePlaces) {
    out.push({ kind: "safe", id: p.id, name: p.name, hint: "A wide scene of this resting place (shown while you rest).", note: n[`safe:${p.id}`] });
  }
  return out;
}

/** Match an uploaded file name to an asset ("goblin-boss.png" -> monster goblin-boss). */
export function matchFile(name: string, items: AssetItem[]): AssetItem | undefined {
  const base = slug(name.replace(/\.[a-z0-9]+$/i, ""));
  const score = (it: AssetItem) => {
    const a = slug(it.name);
    const b = slug(it.id);
    if (base === a || base === b) return 3;
    if (base.includes(a) || base.includes(b) || a.includes(base)) return 2;
    if (it.kind === "map" && /map/.test(base)) return 2;
    if (it.kind === "hero" && /hero|player|character|me\b/.test(base)) return 2;
    return 0;
  };
  let best: AssetItem | undefined;
  let bestScore = 0;
  for (const it of items) {
    const s = score(it);
    if (s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}
