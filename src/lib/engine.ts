// Pure game rules. No storage, no UI: every function takes state and returns new state.
import type { Adventure, Badge, Character, LevelRow, Monster, Run, Stop } from "./types";

export function levelRow(level: number, table: LevelRow[]): LevelRow {
  return table.find((r) => r.level === level) ?? table[table.length - 1];
}

export function levelForXp(xp: number, table: LevelRow[]): number {
  let lvl = table[0].level;
  for (const r of table) if (xp >= r.xp) lvl = r.level;
  return lvl;
}

/** XP at which the next level starts, or null at max level. */
export function nextLevelXp(level: number, table: LevelRow[]): number | null {
  return table.find((r) => r.level === level + 1)?.xp ?? null;
}

export function maxHp(c: Character, table: LevelRow[]) {
  return levelRow(c.level, table).maxHp;
}

export function playerDamage(c: Character, table: LevelRow[]) {
  return levelRow(c.level, table).damage;
}

/** Monster damage per wrong answer after the difficulty multiplier (25%..100%). Never below 1. */
export function monsterDamage(m: Monster, difficulty: number) {
  const d = Math.min(1, Math.max(0.25, difficulty));
  return Math.max(1, Math.round(m.hitDamage * d));
}

export function monsterOf(adv: Adventure, run: Run, id: string): Monster {
  const base = adv.monsters[id];
  const o = run.monsterOverrides[id] ?? {};
  return { ...base, ...o, attacks: o.attacks ?? base.attacks };
}

export interface Foe {
  monsterId: string;
  label: string;
}

export function lineup(stop: Stop, adv: Adventure): Foe[] {
  const out: Foe[] = [];
  for (const g of stop.encounter.monsters) {
    const name = adv.monsters[g.monsterId]?.name ?? g.monsterId;
    for (let i = 1; i <= g.count; i++) out.push({ monsterId: g.monsterId, label: g.count > 1 ? `${name} ${i} of ${g.count}` : name });
  }
  return out;
}

export function currentStop(run: Run, adv: Adventure): Stop | undefined {
  return adv.stops[run.stopIndex];
}

export function currentFoe(run: Run, adv: Adventure): { foe: Foe; monster: Monster; index: number; total: number } | undefined {
  const stop = currentStop(run, adv);
  if (!stop) return undefined;
  const l = lineup(stop, adv);
  const foe = l[run.foeIndex];
  if (!foe) return undefined;
  return { foe, monster: monsterOf(adv, run, foe.monsterId), index: run.foeIndex, total: l.length };
}

export function newRun(adv: Adventure, name: string, table: LevelRow[], portraitId?: string): Run {
  const level = Math.max(1, Math.min(adv.recommendedLevel || 1, table[table.length - 1].level));
  const row = levelRow(level, table);
  const now = Date.now();
  return {
    adventureId: adv.id,
    character: {
      name,
      level,
      xp: row.xp,
      hp: row.maxHp,
      portraitId,
      portraitHistory: portraitId ? [{ level, imageId: portraitId, at: now }] : [],
      badges: [],
    },
    stopIndex: 0,
    foeIndex: 0,
    foeHp: 0,
    phase: "narration",
    knockedOut: false,
    monsterOverrides: {},
    fight: { log: [], xp: 0, defeated: [], knockouts: 0 },
    stats: { answered: 0, correct: 0, defeated: [], visited: [], knockouts: 0, startedAt: now },
    updatedAt: now,
  };
}

function award(c: Character, b: Omit<Badge, "earnedAt">): Badge | null {
  if (c.badges.some((x) => x.id === b.id)) return null;
  const badge = { ...b, earnedAt: Date.now() };
  c.badges.push(badge);
  return badge;
}

/** Start (or restart after a knock-out) the fight of the current stop. */
export function beginFight(run: Run, adv: Adventure): Run {
  const stop = currentStop(run, adv);
  if (!stop) return run;
  const r: Run = structuredClone(run);
  const first = lineup(stop, adv)[0];
  r.phase = "combat";
  r.knockedOut = false;
  r.foeIndex = 0;
  r.foeHp = monsterOf(adv, r, first.monsterId).hp;
  r.fight = { log: [], xp: 0, defeated: [], knockouts: 0 };
  if (!r.stats.visited.includes(stop.locationId)) r.stats.visited.push(stop.locationId);
  r.updatedAt = Date.now();
  return r;
}

export interface FightEvent {
  kind: "hit" | "miss";
  damage: number;
  foeDefeated?: { name: string; xp: number };
  fightWon?: boolean;
  knockedOut?: boolean;
  leveledUp?: number;
  badges: Badge[];
}

export function answerInFight(
  run: Run,
  adv: Adventure,
  table: LevelRow[],
  difficulty: number,
  qkey: string,
  correct: boolean,
): { run: Run; event: FightEvent } {
  const r: Run = structuredClone(run);
  const cur = currentFoe(r, adv);
  if (!cur || r.phase !== "combat") return { run, event: { kind: "miss", damage: 0, badges: [] } };
  const c = r.character;
  const badges: Badge[] = [];
  r.stats.answered++;
  r.fight.log.push({ qkey, correct });
  r.updatedAt = Date.now();

  if (!correct) {
    const dmg = monsterDamage(cur.monster, difficulty);
    c.hp = Math.max(0, c.hp - dmg);
    const ev: FightEvent = { kind: "miss", damage: dmg, badges };
    if (c.hp === 0) {
      // Knocked out: wake at a safe place; the monster recovers fully when the fight restarts.
      r.knockedOut = true;
      r.fight.knockouts++;
      r.stats.knockouts++;
      r.phase = "rest";
      r.restReturn = "narration";
      r.foeHp = cur.monster.hp;
      ev.knockedOut = true;
    }
    return { run: r, event: ev };
  }

  r.stats.correct++;
  const dmg = playerDamage(c, table);
  r.foeHp = Math.max(0, r.foeHp - dmg);
  const ev: FightEvent = { kind: "hit", damage: dmg, badges };
  if (r.stats.correct === 100) { const b = award(c, { id: "scholar-100", name: "100 correct answers", icon: "📚" }); if (b) badges.push(b); }
  if (r.foeHp > 0) return { run: r, event: ev };

  // Monster defeated: XP from its stat block.
  const xp = cur.monster.xp;
  c.xp += xp;
  r.fight.xp += xp;
  r.fight.defeated.push(cur.foe.monsterId);
  r.stats.defeated.push(cur.foe.monsterId);
  ev.foeDefeated = { name: cur.foe.label, xp };
  if (r.stats.defeated.length === 1) { const b = award(c, { id: "first-blood", name: "First victory", icon: "🗡️" }); if (b) badges.push(b); }

  const newLevel = levelForXp(c.xp, table);
  if (newLevel > c.level) {
    const oldMax = levelRow(c.level, table).maxHp;
    c.level = newLevel;
    // Level-up raises max HP; the extra HP is gained, current wounds stay.
    c.hp = Math.min(levelRow(newLevel, table).maxHp, c.hp + (levelRow(newLevel, table).maxHp - oldMax));
    ev.leveledUp = newLevel;
    r.fight.leveledTo = newLevel;
    r.pendingPortraitLevel = newLevel;
    const b = award(c, { id: `level-${newLevel}`, name: `Reached level ${newLevel}`, icon: "⭐" });
    if (b) badges.push(b);
  }

  const stop = currentStop(r, adv)!;
  const l = lineup(stop, adv);
  if (r.foeIndex + 1 < l.length) {
    r.foeIndex++;
    r.foeHp = monsterOf(adv, r, l[r.foeIndex].monsterId).hp;
    return { run: r, event: ev };
  }

  // Encounter won.
  ev.fightWon = true;
  r.phase = "results";
  if (stop.encounter.boss) {
    const b = award(c, { id: `boss-${stop.encounter.id}`, name: `Defeated ${stop.encounter.name}`, icon: "👑" });
    if (b) badges.push(b);
  }
  if (r.fight.log.every((x) => x.correct) && r.fight.log.length >= 3) {
    const b = award(c, { id: `flawless-${stop.id}`, name: `Flawless: ${stop.encounter.name}`, icon: "🛡️" });
    if (b) badges.push(b);
  }
  const next = adv.stops[r.stopIndex + 1];
  if (!next || next.locationId !== stop.locationId) {
    const b = award(c, { id: `location-${stop.locationId}`, name: `Cleared ${stop.location}`, icon: "🗺️" });
    if (b) badges.push(b);
  }
  if (!next || next.chapterId !== stop.chapterId) {
    const ch = adv.chapters.find((x) => x.id === stop.chapterId);
    const b = award(c, { id: `chapter-${stop.chapterId}`, name: `Finished ${ch?.title ?? "a chapter"}`, icon: "📜" });
    if (b) badges.push(b);
  }
  return { run: r, event: ev };
}

/** Move on after the results screen. */
export function advance(run: Run, adv: Adventure): Run {
  const r: Run = structuredClone(run);
  r.stopIndex++;
  r.foeIndex = 0;
  r.foeHp = 0;
  r.phase = r.stopIndex >= adv.stops.length ? "done" : "narration";
  if (r.phase === "done") r.stats.finishedAt = Date.now();
  r.updatedAt = Date.now();
  return r;
}

export function goRest(run: Run): Run {
  if (run.phase !== "narration" && run.phase !== "results") return run;
  const r: Run = structuredClone(run);
  r.restReturn = r.phase;
  r.phase = "rest";
  r.updatedAt = Date.now();
  return r;
}

/** A correct answer in a mock combat restores 1 HP (up to max). */
export function answerInMock(run: Run, table: LevelRow[], correct: boolean): Run {
  const r: Run = structuredClone(run);
  if (correct) r.character.hp = Math.min(maxHp(r.character, table), r.character.hp + 1);
  r.updatedAt = Date.now();
  return r;
}

export function canLeaveRest(run: Run) {
  return run.character.hp > 0;
}

export function leaveRest(run: Run): Run {
  if (!canLeaveRest(run)) return run;
  const r: Run = structuredClone(run);
  r.phase = r.restReturn ?? "narration";
  r.restReturn = undefined;
  r.knockedOut = false;
  r.updatedAt = Date.now();
  return r;
}

export function streakBadges(c: Character, streak: number): Badge[] {
  const out: Badge[] = [];
  for (const n of [3, 7, 30, 100]) {
    if (streak >= n) {
      const b = award(c, { id: `streak-${n}`, name: `${n}-day study streak`, icon: "🔥" });
      if (b) out.push(b);
    }
  }
  return out;
}
