// App-level persistence helpers: settings, levels table, adventures, runs.
import { db, kvGet, kvSet } from "./db";
import { deleteRunRemote, pushAdventure, pushKv, pushRun } from "./sync";
import type { Adventure, LevelRow, Run, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 1,
  sound: true,
  proxyUrl: "",
  proxyToken: "",
  selectedTags: null,
};

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await kvGet<Settings>("settings")) ?? {}) };
}

export async function saveSettings(s: Settings) {
  await kvSet("settings", s);
  pushKv("settings");
}

let levelsCache: LevelRow[] | null = null;

/** Level table from public/levels.json (editable without rebuilding). Falls back to a copy in the database. */
export async function loadLevels(): Promise<LevelRow[]> {
  if (levelsCache) return levelsCache;
  try {
    const res = await fetch("./levels.json", { cache: "no-cache" });
    const data = (await res.json()) as { levels: LevelRow[] };
    if (!Array.isArray(data.levels) || data.levels.length === 0) throw new Error("bad levels.json");
    levelsCache = [...data.levels].sort((a, b) => a.level - b.level);
    await kvSet("levels", levelsCache);
  } catch {
    levelsCache = (await kvGet<LevelRow[]>("levels")) ?? [{ level: 1, xp: 0, maxHp: 12, damage: 8 }];
  }
  return levelsCache;
}

const BUILTIN = ["lantern-of-saint-quell"];

export async function listAdventures(): Promise<Adventure[]> {
  const d = await db();
  const stored = await d.getAll("adventures");
  const have = new Set(stored.map((a) => a.id));
  // Built-in adventures are refreshed from the published file each load, so updates
  // (new map data, fixed text) reach players who stored an older copy.
  for (const id of BUILTIN) {
    try {
      const res = await fetch(`./adventures/${id}.json`, { cache: "no-cache" });
      const a = (await res.json()) as Adventure;
      await d.put("adventures", a);
      if (have.has(id)) stored.splice(stored.findIndex((x) => x.id === id), 1, a);
      else stored.push(a);
    } catch {
      /* offline: keep the stored copy */
    }
  }
  return stored;
}

export function validateAdventure(a: unknown): string[] {
  const errs: string[] = [];
  const x = a as Adventure;
  if (!x || x.format !== "study-rpg-adventure") errs.push('format must be "study-rpg-adventure"');
  if (!x?.id) errs.push("missing id");
  if (!x?.title) errs.push("missing title");
  if (!Array.isArray(x?.stops) || x.stops.length === 0) errs.push("no stops");
  if (!x?.monsters || typeof x.monsters !== "object") errs.push("no monsters");
  if (errs.length) return errs;
  x.stops.forEach((s, i) => {
    if (!s.encounter?.monsters?.length) errs.push(`stop ${i + 1} has no monsters`);
    for (const m of s.encounter?.monsters ?? []) if (!x.monsters[m.monsterId]) errs.push(`stop ${i + 1}: unknown monster "${m.monsterId}"`);
    if (!x.safePlaces?.some((p) => p.id === s.safePlaceId)) errs.push(`stop ${i + 1}: unknown safe place "${s.safePlaceId}"`);
  });
  for (const m of Object.values(x.monsters)) {
    if (!(m.hp > 0)) errs.push(`${m.name}: hp must be > 0`);
    if (!(m.hitDamage >= 0)) errs.push(`${m.name}: hitDamage missing`);
    if (!(m.xp >= 0)) errs.push(`${m.name}: xp missing`);
  }
  return errs;
}

export async function saveAdventure(a: Adventure) {
  await (await db()).put("adventures", a);
  pushAdventure(a.id);
}

export async function getRun(adventureId: string): Promise<Run | undefined> {
  return (await db()).get("runs", adventureId);
}

export async function saveRun(r: Run) {
  await (await db()).put("runs", r);
  pushRun(r.adventureId);
}

export async function deleteRun(adventureId: string) {
  const d = await db();
  await d.delete("runs", adventureId);
  const keys = (await d.getAllKeys("narration")).filter((k) => String(k).startsWith(adventureId + ":"));
  const tx = d.transaction("narration", "readwrite");
  for (const k of keys) tx.store.delete(k);
  await tx.done;
  deleteRunRemote(adventureId);
}
