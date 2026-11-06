import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { BattleScreen, TypeText, type StageEvent, type StageFoe, type StageHero } from "../art/BattleScreen";
import { MapView, safePlaceTerrain, stopTerrain } from "../art/MapView";
import { sceneUrl } from "../art/scenes";
import { heroPalette, spriteFor, spriteUrl } from "../art/sprites";
import { assetId, StatBlock, TopicPicker } from "../components/Panels";
import { useStoredImage } from "../lib/images";
import { QuestionCard } from "../components/QuestionCard";
import { Modal, RichText, TopBar } from "../components/ui";
import { getEndingNarration, getRestNarration, getStopNarration, prefetchNext } from "../lib/ai";
import {
  advance,
  answerInFight,
  answerInMock,
  beginFight,
  canLeaveRest,
  currentFoe,
  currentStop,
  goRest,
  leaveRest,
  levelRow,
  lineup,
  maxHp,
  monsterDamage,
  nextLevelXp,
  playerDamage,
  streakBadges,
  type FightEvent,
} from "../lib/engine";
import { db } from "../lib/db";
import { forgetImageUrl, storeImage } from "../lib/images";
import { getStreak, nextFightQuestion, nextMockQuestion, recordAnswer } from "../lib/questions";
import { sfx } from "../lib/sound";
import type { Adventure, Badge, Character, LevelRow, Monster, NarrationBundle, Question } from "../lib/types";

export function Play() {
  const { run, adventure, go } = useApp();
  // Keeps the battle on screen after the last answer of a fight until the player taps Continue.
  const [hold, setHold] = useState(false);
  if (!run || !adventure) {
    return (
      <main className="screen">
        <TopBar title="Adventure" onBack={() => go("home")} />
        <p>No adventure started.</p>
      </main>
    );
  }
  return (
    <main className="screen play">
      {(run.phase === "combat" || hold) && <CombatView setHold={setHold} />}
      {!hold && run.phase === "narration" && <NarrationView />}
      {!hold && run.phase === "results" && <ResultsView />}
      {!hold && run.phase === "rest" && <RestView />}
      {!hold && run.phase === "done" && <EndingView />}
      {!hold && run.pendingPortraitLevel && run.phase !== "combat" && <LevelUpPortrait />}
    </main>
  );
}

function heroOf(c: Character, levels: LevelRow[]): StageHero {
  const base = levelRow(c.level, levels).xp;
  const next = nextLevelXp(c.level, levels);
  return {
    name: c.name,
    level: c.level,
    hp: c.hp,
    maxHp: maxHp(c, levels),
    xpPct: next ? Math.round(((c.xp - base) / (next - base)) * 100) : 100,
  };
}

function foeOf(adv: Adventure, m: Monster, label: string, hp: number): StageFoe {
  return {
    id: m.id,
    label,
    sub: m.cr ? `CR ${m.cr}` : undefined,
    hp,
    maxHp: m.hp,
    sprite: spriteFor(m.name, m.sprite),
    imageId: assetId(adv.id, "monster", m.id),
  };
}

/** The place, painted in pixels, with the hero walking in. */
function SceneBanner({ terrain, level, caption, imageId }: { terrain: string; level: number; caption?: string; imageId?: string }) {
  const img = useStoredImage(imageId);
  return (
    <div className={`scene-banner ${img ? "scene-photo" : ""}`}>
      {img === undefined && imageId ? null : img ? <img className="scene-bg" src={img.url} alt="" /> : <img className="scene-bg pixel" src={sceneUrl(terrain)} alt="" />}
      {!img && <img className="pixel scene-hero" src={spriteUrl("hero", heroPalette(level))} alt="" />}
      {caption && <span className="scene-caption">{caption}</span>}
    </div>
  );
}

// ---------------- Story between fights ----------------

function NarrationView() {
  const { run, adventure, settings, setRun, go, levels } = useApp();
  const stop = currentStop(run!, adventure!)!;
  const [bundle, setBundle] = useState<NarrationBundle>();
  const [skipped, setSkipped] = useState(false);
  const [topics, setTopics] = useState(false);
  const chapter = adventure!.chapters.find((c) => c.id === stop.chapterId);
  const firstOfChapter = adventure!.stops.findIndex((s) => s.chapterId === stop.chapterId) === run!.stopIndex;
  const terrain = stopTerrain(adventure!, stop.locationId, `${stop.location} ${stop.description}`);

  useEffect(() => {
    let live = true;
    setBundle(undefined);
    setSkipped(false);
    void getStopNarration(adventure!, run!, run!.stopIndex, settings).then((b) => live && setBundle(b));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run!.stopIndex]);

  const c = run!.character;
  const hurt = c.hp < maxHp(c, levels);
  const text = bundle?.narration ?? (skipped ? stop.narration : "");
  return (
    <>
      <TopBar title={stop.location} onBack={() => go("home")} right={<button className="icon-btn" onClick={() => go("map")} aria-label="Story map">🗺</button>} />
      {firstOfChapter && <p className="chapter-title">{chapter?.title}</p>}
      <MapView adv={adventure!} stopIndex={run!.stopIndex} travel compact />
      <SceneBanner terrain={terrain} level={c.level} caption={stop.location} imageId={assetId(adventure!.id, "location", stop.locationId)} />
      <article className="parchment narration">
        {run!.stopIndex === 0 && <RichText text={adventure!.intro} className="intro" />}
        {text ? <RichText text={text} className="dropcap" /> : <p className="muted">The Dungeon Master is writing…</p>}
        {bundle?.ai && <p className="byline">Narrated by Claude, your Dungeon Master</p>}
      </article>
      <div className="hud-line">
        <span>{c.name} · Lv {c.level}</span>
        <span className={c.hp / maxHp(c, levels) > 0.5 ? "" : "warn"}>HP {c.hp}/{maxHp(c, levels)}</span>
        <span>{playerDamage(c, levels)} damage per hit</span>
      </div>
      <div className="menu">
        <button className="btn primary big" onClick={() => setRun(beginFight(run!, adventure!))}>
          ⚔︎ Face {stop.encounter.name}
        </button>
        {!bundle && !skipped && <button className="btn" onClick={() => setSkipped(true)}>Skip narration</button>}
        <div className="grid2">
          <button className="btn" onClick={() => setRun(goRest(run!))} disabled={!hurt}>{hurt ? "Rest at a safe place" : "Full health"}</button>
          <button className="btn" onClick={() => setTopics(true)}>Topics{settings.selectedTags ? ` (${settings.selectedTags.length})` : ""}</button>
        </div>
      </div>
      {topics && <TopicPicker onClose={() => setTopics(false)} />}
    </>
  );
}

// ---------------- Combat ----------------

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] ?? "";

function CombatView({ setHold }: { setHold: (h: boolean) => void }) {
  const { run, adventure, settings, setRun, go, levels } = useApp();
  const [q, setQ] = useState<Question | null | undefined>(undefined);
  const [bundle, setBundle] = useState<NarrationBundle>();
  const [event, setEvent] = useState<FightEvent | null>(null);
  const [stageEvent, setStageEvent] = useState<StageEvent | null>(null);
  const [frozen, setFrozen] = useState<StageFoe | null>(null);
  const [message, setMessage] = useState("");
  const [stat, setStat] = useState<Monster | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const evKey = useRef(0);

  const loadQuestion = useCallback(async () => {
    const t0 = performance.now();
    const next = await nextFightQuestion(settings.selectedTags);
    setQ(next ?? null);
    (window as unknown as { __lastQuestionMs?: number }).__lastQuestionMs = performance.now() - t0;
  }, [settings.selectedTags]);

  const cur = currentFoe(run!, adventure!);
  const stop = currentStop(run!, adventure!)!;
  const terrain = stopTerrain(adventure!, stop.locationId, `${stop.location} ${stop.description}`);

  const introFor = useCallback(
    (b: NarrationBundle | undefined) => {
      const c = currentFoe(runRef.current!, adventure!);
      if (!c) return "";
      const line = b?.intros[c.monster.id] ?? c.monster.description ?? "";
      return `${c.foe.label} appears! ${line}`.trim();
    },
    [adventure],
  );

  useEffect(() => {
    void loadQuestion();
    setMessage(introFor(undefined));
    void getStopNarration(adventure!, run!, run!.stopIndex, settings).then((b) => {
      setBundle(b);
      setMessage(introFor(b));
    });
    prefetchNext(adventure!, run!, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const foe: StageFoe | null = frozen ?? (cur ? foeOf(adventure!, cur.monster, cur.foe.label, run!.foeHp) : null);

  const onResult = async (correct: boolean) => {
    const before = runRef.current!;
    const b = currentFoe(before, adventure!)!;
    await recordAnswer(q!, correct, "fight");
    const { run: after, event: ev } = answerInFight(before, adventure!, levels, settings.difficulty, q!.key, correct);
    const streak = await getStreak();
    ev.badges.push(...streakBadges(after.character, streak.count));
    const line = pick(correct ? (bundle?.hitLines ?? adventure!.hitLines) : (bundle?.missLines ?? adventure!.missLines));
    const foeHpAfter = ev.foeDefeated ? 0 : after.phase === "combat" && after.foeIndex === before.foeIndex ? after.foeHp : before.foeHp;
    setFrozen(foeOf(adventure!, b.monster, b.foe.label, correct ? foeHpAfter : before.foeHp));
    setEvent(ev);
    setStageEvent({ key: ++evKey.current, kind: correct ? "hit" : "miss", damage: ev.damage, foeFaints: !!ev.foeDefeated });
    let msg = correct ? `${line} ${b.foe.label} takes ${ev.damage} damage.` : `${line} You take ${ev.damage} damage.`;
    if (ev.foeDefeated) msg += ` ${b.foe.label} is defeated! +${ev.foeDefeated.xp} XP.`;
    if (ev.knockedOut) msg += " Your vision goes dark…";
    setMessage(msg);
    if (correct) (ev.foeDefeated ? sfx.victory : sfx.hit)(settings.sound);
    else sfx.miss(settings.sound);
    if (ev.leveledUp) {
      sfx.level(settings.sound);
      setTimeout(() => {
        setStageEvent({ key: ++evKey.current, kind: "levelup" });
        setMessage((m) => `${m} Level up! You are now level ${ev.leveledUp}.`);
      }, 1500);
    }
    // The true state is saved right away; the screen stays on the fight until "Continue".
    if (after.phase !== "combat") setHold(true);
    await setRun(after);
  };

  const onNext = async () => {
    setEvent(null);
    setFrozen(null);
    if (runRef.current!.phase !== "combat") {
      setHold(false);
      return;
    }
    setMessage(introFor(bundle));
    setQ(undefined);
    await loadQuestion();
  };

  if (!foe) return <p>Nothing to fight here.</p>;
  const monster = adventure!.monsters[foe.id] ? { ...adventure!.monsters[foe.id], ...(run!.monsterOverrides[foe.id] ?? {}) } : null;

  return (
    <>
      <TopBar title={stop.encounter.name} onBack={() => go("home")} right={cur && cur.total > 1 ? <span className="foe-count">{Math.min(cur.index + 1, cur.total)}/{cur.total}</span> : undefined} />
      <BattleScreen
        terrain={terrain}
        backdropId={assetId(adventure!.id, "location", stop.locationId)}
        heroImageId={assetId(adventure!.id, "hero", "battle")}
        foe={foe}
        hero={heroOf(run!.character, levels)}
        event={stageEvent}
        message={message}
        aside={
          monster && (
            <button className="btn small ghost" onClick={() => setStat(monster as Monster)}>
              Stat block · hits for {monsterDamage(monster as Monster, settings.difficulty)}
            </button>
          )
        }
      />
      {q === undefined && <p className="muted center">Drawing a question…</p>}
      {q === null && (
        <div className="parchment">
          <p>No questions match your current upload and topics.</p>
          <button className="btn primary" onClick={() => go("upload")}>Upload questions</button>
        </div>
      )}
      {q && (
        <QuestionCard
          q={q}
          settings={settings}
          onResult={onResult}
          onNext={onNext}
          nextLabel={event?.knockedOut ? "You fall…" : event?.fightWon ? "Victory!" : event?.foeDefeated ? "Next foe" : "Next round"}
          flavor={event && <BadgeList badges={event.badges} />}
        />
      )}
      {stat && <StatBlock monster={stat} onClose={() => setStat(null)} />}
    </>
  );
}

function BadgeList({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <div className="badges-new">
      {badges.map((b) => (
        <span key={b.id} className="badge">{b.icon} {b.name}</span>
      ))}
    </div>
  );
}

// ---------------- Results ----------------

function ResultsView() {
  const { run, adventure, setRun, go, levels } = useApp();
  const [missed, setMissed] = useState<Question[]>([]);
  const stop = currentStop(run!, adventure!)!;
  const f = run!.fight;
  useEffect(() => {
    void (async () => {
      const d = await db();
      const keys = [...new Set(f.log.filter((x) => !x.correct).map((x) => x.qkey))];
      const qs = await Promise.all(keys.map(async (k) => (await d.get("questions", k)) ?? (await d.get("marks", k))?.snapshot));
      setMissed(qs.filter(Boolean) as Question[]);
    })();
  }, [f.log]);
  const right = f.log.filter((x) => x.correct).length;
  const isLast = run!.stopIndex + 1 >= adventure!.stops.length;
  const hurt = run!.character.hp < maxHp(run!.character, levels);
  const recent = run!.character.badges.filter((b) => Date.now() - b.earnedAt < 10 * 60_000);
  const terrain = stopTerrain(adventure!, stop.locationId, `${stop.location} ${stop.description}`);

  return (
    <>
      <TopBar title="Victory" onBack={() => go("home")} />
      <SceneBanner terrain={terrain} level={run!.character.level} caption={`${stop.encounter.name} defeated`} imageId={assetId(adventure!.id, "location", stop.locationId)} />
      <section className="parchment results">
        <h2>{stop.encounter.boss ? "The boss is beaten!" : "The way is clear"}</h2>
        <div className="stat-row">
          <div className="stat"><b>+{f.xp}</b><span>XP</span></div>
          <div className="stat"><b>{right}/{f.log.length}</b><span>correct</span></div>
          <div className="stat"><b>{lineup(stop, adventure!).length}</b><span>foes</span></div>
        </div>
        {f.leveledTo && <p className="level-up">⭐ You reached level {f.leveledTo}! Max HP {levelRow(f.leveledTo, levels).maxHp}, damage {levelRow(f.leveledTo, levels).damage}.</p>}
        <BadgeList badges={recent} />
      </section>
      {missed.length > 0 && (
        <section className="parchment">
          <h3>Missed in this fight ({missed.length})</h3>
          {missed.map((q) => (
            <details key={q.key} className="missed">
              <summary><RichText text={q.question.split("\n")[0]} /></summary>
              <div className="answer-box"><span className="label">Answer</span><RichText text={q.answerText} /></div>
              {q.explanation && <RichText text={q.explanation} className="muted" />}
            </details>
          ))}
          <p className="muted small">They are marked: you will see them in mock combats, later fights and Review.</p>
        </section>
      )}
      <div className="menu">
        <button className="btn primary big" onClick={() => setRun(advance(run!, adventure!))}>{isLast ? "Finish the adventure" : "Onward"}</button>
        <button className="btn" disabled={!hurt} onClick={() => setRun(goRest(run!))}>{hurt ? "Rest at a safe place" : "Full health"}</button>
      </div>
    </>
  );
}

// ---------------- Rest / mock combat ----------------

function RestView() {
  const { run, adventure, settings, setRun, go, levels } = useApp();
  const [story, setStory] = useState<{ place: string; text: string }>();
  const [item, setItem] = useState<{ q: Question; marked: boolean } | null | undefined>();
  const [healed, setHealed] = useState(0);
  const [stageEvent, setStageEvent] = useState<StageEvent | null>(null);
  const [message, setMessage] = useState("");
  const runRef = useRef(run);
  runRef.current = run;
  const evKey = useRef(0);

  const stop = currentStop(run!, adventure!) ?? adventure!.stops[adventure!.stops.length - 1];
  const place = adventure!.safePlaces.find((p) => p.id === stop.safePlaceId) ?? adventure!.safePlaces[0];
  const terrain = safePlaceTerrain(adventure!, place.id, `${place.name} ${place.description}`);

  useEffect(() => {
    void getRestNarration(adventure!, run!, settings).then((s) => {
      setStory(s);
      setMessage("Study by candlelight. Each correct answer restores 1 HP.");
    });
    void nextMockQuestion(settings.selectedTags).then((x) => setItem(x ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = run!.character;
  const max = maxHp(c, levels);
  const onResult = async (correct: boolean) => {
    await recordAnswer(item!.q, correct, "mock");
    const before = runRef.current!;
    const after = answerInMock(before, levels, correct);
    const gained = after.character.hp > before.character.hp;
    if (gained) {
      setHealed((h) => h + 1);
      sfx.heal(settings.sound);
      setStageEvent({ key: ++evKey.current, kind: "heal" });
    }
    setMessage(correct ? (gained ? "You feel stronger. +1 HP." : "You are already at full health.") + (item!.marked ? " Mark cleared." : "") : "Not quite. The question stays marked.");
    await setRun(after);
  };
  const onNext = async () => {
    setItem(undefined);
    setItem((await nextMockQuestion(settings.selectedTags)) ?? null);
  };

  return (
    <>
      <TopBar title={story?.place ?? place.name} onBack={() => go("home")} />
      <BattleScreen
        terrain={terrain}
        backdropId={assetId(adventure!.id, "safe", place.id)}
        heroImageId={assetId(adventure!.id, "hero", "battle")}
        foe={{ id: "tome", label: "Mock combat", sub: item?.marked ? "marked questions" : "random questions", sprite: "tome" }}
        hero={heroOf(c, levels)}
        event={stageEvent}
        message={message || "…"}
      />
      <article className="parchment narration">
        {story ? <RichText text={story.text} className="dropcap" /> : <p className="muted">…</p>}
        <p className="muted small">
          {item?.marked ? "Only questions you got wrong. A correct answer heals 1 HP and clears the mark." : "Nothing is marked, so these are random questions from your upload. Each correct answer heals 1 HP."}
          {healed > 0 && ` Healed ${healed} HP this rest.`}
          {c.hp >= max && " You are at full health."}
        </p>
      </article>
      {item === undefined && <p className="muted center">…</p>}
      {item === null && <p className="parchment">No questions available. Upload questions first.</p>}
      {item && <QuestionCard q={item.q} settings={settings} marked={item.marked} onResult={onResult} onNext={onNext} nextLabel="Next question" />}
      <div className="menu">
        <button className="btn primary big" disabled={!canLeaveRest(run!)} onClick={() => setRun(leaveRest(run!))}>
          {canLeaveRest(run!) ? (run!.knockedOut ? "Return to the fight" : "Leave and continue") : "You need at least 1 HP to leave"}
        </button>
      </div>
    </>
  );
}

// ---------------- Ending ----------------

function EndingView() {
  const { run, adventure, settings, go } = useApp();
  const [text, setText] = useState<string>();
  useEffect(() => {
    void getEndingNarration(adventure!, run!, settings).then(setText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = run!.stats;
  const mins = Math.round(((s.finishedAt ?? Date.now()) - s.startedAt) / 60000);
  const locations = new Set(adventure!.stops.map((x) => x.locationId)).size;
  const monsters = adventure!.stops.reduce((a, x) => a + lineup(x, adventure!).length, 0);
  return (
    <>
      <TopBar title="The End" onBack={() => go("home")} />
      <MapView adv={adventure!} stopIndex={adventure!.stops.length} compact />
      <article className="parchment narration">{text ? <RichText text={text} className="dropcap" /> : <TypeText text="…" />}</article>
      <section className="parchment">
        <h3>Run statistics</h3>
        <div className="stat-row">
          <div className="stat"><b>{s.correct}/{s.answered}</b><span>correct</span></div>
          <div className="stat"><b>{s.answered ? Math.round((100 * s.correct) / s.answered) : 0}%</b><span>accuracy</span></div>
          <div className="stat"><b>{run!.character.level}</b><span>level</span></div>
        </div>
        <p>Locations visited: {s.visited.length} / {locations} · Monsters defeated: {s.defeated.length} / {monsters} · Knock-outs: {s.knockouts} · Time: {mins} min</p>
        <BadgeList badges={run!.character.badges} />
      </section>
      <div className="menu">
        <button className="btn primary big" onClick={() => go("newrun")}>New run</button>
        <button className="btn" onClick={() => go("review")}>Review marked questions</button>
      </div>
      {adventure!.credits && <p className="muted small credits">{adventure!.credits}</p>}
    </>
  );
}

// ---------------- Level-up portrait ----------------

function LevelUpPortrait() {
  const { run, setRun } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const lvl = run!.pendingPortraitLevel!;
  const done = async (imageId?: string) => {
    const r = structuredClone(run!);
    if (imageId) {
      r.character.portraitId = imageId;
      r.character.portraitHistory.push({ level: lvl, imageId, at: Date.now() });
    }
    r.pendingPortraitLevel = undefined;
    await setRun(r);
  };
  return (
    <Modal title={`Level ${lvl}!`} onClose={() => done()}>
      <div className="levelup-art">
        <img className="pixel" src={spriteUrl("hero", heroPalette(lvl - 1))} alt="Before" />
        <span aria-hidden="true">→</span>
        <img className="pixel" src={spriteUrl("hero", heroPalette(lvl))} alt="After" />
      </div>
      <p>Your hero grows stronger{[4, 7, 11].includes(lvl) ? " and earns new armour" : ""}. You can also upload an upgraded portrait; earlier pictures stay in your level history.</p>
      <div className="row">
        <button className="btn" onClick={() => ref.current?.click()}>Upload new portrait</button>
        <button className="btn primary" onClick={() => done()}>Continue</button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const id = `portrait:${run!.adventureId}:${Date.now()}`;
          forgetImageUrl(id);
          await storeImage(id, f, "portrait", 800);
          await done(id);
        }}
      />
    </Modal>
  );
}

