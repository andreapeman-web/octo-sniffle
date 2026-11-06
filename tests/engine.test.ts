import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as E from "../src/lib/engine";
import type { Adventure, LevelRow } from "../src/lib/types";

const adv = JSON.parse(readFileSync("public/adventures/lantern-of-saint-quell.json", "utf8")) as Adventure;
const levels = (JSON.parse(readFileSync("public/levels.json", "utf8")) as { levels: LevelRow[] }).levels;

describe("rules", () => {
  it("uses the level table from the brief", () => {
    expect(E.levelForXp(0, levels)).toBe(1);
    expect(E.levelForXp(299, levels)).toBe(1);
    expect(E.levelForXp(300, levels)).toBe(2);
    expect(E.levelRow(5, levels)).toMatchObject({ maxHp: 44, damage: 33 });
    expect(E.levelRow(20, levels)).toMatchObject({ maxHp: 164, damage: 53, xp: 355000 });
  });

  it("applies the difficulty multiplier to monster damage", () => {
    const ogre = adv.monsters.ogre;
    expect(E.monsterDamage(ogre, 1)).toBe(13);
    expect(E.monsterDamage(ogre, 0.5)).toBe(7);
    expect(E.monsterDamage(ogre, 0.1)).toBe(3); // clamped to 25%
  });

  it("plays a fight: hits, monster hits, XP only on defeat", () => {
    let r = E.beginFight(E.newRun(adv, "Test", levels), adv); // 2 wolves, 11 HP each
    expect(r.foeHp).toBe(11);
    let res = E.answerInFight(r, adv, levels, 1, "q1", false);
    expect(res.run.character.hp).toBe(12 - 7);
    expect(res.event.kind).toBe("miss");
    r = res.run;
    res = E.answerInFight(r, adv, levels, 1, "q2", true);
    expect(res.run.foeHp).toBe(3);
    expect(res.run.character.xp).toBe(0);
    res = E.answerInFight(res.run, adv, levels, 1, "q3", true);
    expect(res.event.foeDefeated?.xp).toBe(50);
    expect(res.run.foeIndex).toBe(1);
    expect(res.run.foeHp).toBe(11);
    res = E.answerInFight(res.run, adv, levels, 1, "q4", true);
    res = E.answerInFight(res.run, adv, levels, 1, "q5", true);
    expect(res.event.fightWon).toBe(true);
    expect(res.run.phase).toBe("results");
    expect(res.run.character.xp).toBe(100);
    expect(res.run.stats.visited).toEqual(["mill-road"]);
  });

  it("knock-out sends the hero to rest, monster HP restored, HP back only via mock combat", () => {
    let r = E.beginFight(E.newRun(adv, "T", levels), adv);
    r = E.answerInFight(r, adv, levels, 1, "a", true).run; // wolf 11 -> 3
    let ev;
    ({ run: r, event: ev } = E.answerInFight(r, adv, levels, 1, "b", false)); // 5 hp
    ({ run: r, event: ev } = E.answerInFight(r, adv, levels, 1, "c", false)); // 0 hp
    expect(ev.knockedOut).toBe(true);
    expect(r.phase).toBe("rest");
    expect(r.foeHp).toBe(11);
    expect(E.canLeaveRest(r)).toBe(false);
    r = E.answerInMock(r, levels, false);
    expect(r.character.hp).toBe(0);
    r = E.answerInMock(r, levels, true);
    expect(r.character.hp).toBe(1);
    r = E.leaveRest(r);
    expect(r.phase).toBe("narration");
    r = E.beginFight(r, adv);
    expect(r.foeIndex).toBe(0);
    expect(r.foeHp).toBe(11);
  });

  it("mock combat never heals above max", () => {
    let r = E.newRun(adv, "T", levels);
    r = E.answerInMock(r, levels, true);
    expect(r.character.hp).toBe(12);
  });

  it("levels up, awards boss and chapter badges, and finishes the run", () => {
    let r = E.newRun(adv, "T", levels);
    for (let s = 0; s < adv.stops.length; s++) {
      r = E.beginFight(r, adv);
      while (r.phase === "combat") r = E.answerInFight(r, adv, levels, 1, "q", true).run;
      expect(r.phase).toBe("results");
      r = E.advance(r, adv);
    }
    expect(r.phase).toBe("done");
    expect(r.stats.defeated).toHaveLength(adv.stops.reduce((a, s) => a + E.lineup(s, adv).length, 0));
    expect(new Set(r.stats.visited).size).toBe(new Set(adv.stops.map((s) => s.locationId)).size);
    expect(r.character.level).toBeGreaterThanOrEqual(3);
    const ids = r.character.badges.map((b) => b.id);
    expect(ids).toContain("boss-e9");
    expect(ids).toContain("chapter-c1");
    expect(ids).toContain("level-2");
    expect(ids).toContain("first-blood");
  });

  it("respects stat-block overrides", () => {
    let r = E.newRun(adv, "T", levels);
    r.monsterOverrides.wolf = { hp: 3, hitDamage: 1, xp: 999 };
    r = E.beginFight(r, adv);
    expect(r.foeHp).toBe(3);
    const res = E.answerInFight(r, adv, levels, 1, "q", true);
    expect(res.event.foeDefeated?.xp).toBe(999);
  });
});
