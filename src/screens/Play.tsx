import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { AssetImage, StatBlock, TopicPicker } from "../components/Panels";
import { QuestionCard } from "../components/QuestionCard";
import { Bar, Modal, Placeholder, RichText, StoredImg, TopBar } from "../components/ui";
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
  playerDamage,
  streakBadges,
  type FightEvent,
} from "../lib/engine";
import { db } from "../lib/db";
import { forgetImageUrl, storeImage } from "../lib/images";
import { getStreak, nextFightQuestion, nextMockQuestion, recordAnswer } from "../lib/questions";
import { sfx } from "../lib/sound";
import type { Badge, Monster, NarrationBundle, Question } from "../lib/types";

export function Play() {
  const { run, adventure, go } = useApp();
  // Keeps the battle screen up after the last answer of a fight until the player taps Continue.
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

function PlayerStrip() {
  const { run, levels, go } = useApp();
  const c = run!.character;
  return (
    <div className="player-strip">
      <button className="mini-portrait" onClick={() => go("character")} aria-label="Character">
        <StoredImg id={c.portraitId} alt={c.name} className="portrait" fallback={<Placeholder kind="portrait" label={c.name} icon="🛡️" />} />
      </button>
      <div className="grow">
        <div className="strip-name">{c.name} · Lv {c.level} · {playerDamage(c, levels)} dmg</div>
        <Bar kind="hp" value={c.hp} max={maxHp(c, levels)} label={`HP ${c.hp} / ${maxHp(c, levels)}`} />
      </div>
    </div>
  );
}

// ---------------- Narration ----------------

function NarrationView() {
  const { run, adventure, settings, setRun, go, levels } = useApp();
  const stop = currentStop(run!, adventure!)!;
  const [bundle, setBundle] = useState<NarrationBundle>();
  const [skipped, setSkipped] = useState(false);
  const [topics, setTopics] = useState(false);
  const chapter = adventure!.chapters.find((c) => c.id === stop.chapterId);
  const firstOfChapter = adventure!.stops.findIndex((s) => s.chapterId === stop.chapterId) === run!.stopIndex;

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

  const hurt = run!.character.hp < maxHp(run!.character, levels);
  return (
    <>
      <TopBar title={stop.location} onBack={() => go("home")} right={<button className="icon-btn" onClick={() => go("map")} aria-label="Story map">🗺</button>} />
      {firstOfChapter && <p className="chapter-title">{chapter?.title}</p>}
      {run!.stopIndex === 0 && <RichText text={adventure!.intro} className="intro" />}
      <AssetImage kind="location" id={stop.locationId} label={stop.location} icon="🏰" editable />
      <div className="narration">
        {bundle ? <RichText text={bundle.narration} /> : skipped ? <RichText text={stop.narration} /> : <p className="muted">The Dungeon Master is writing…</p>}
        {bundle?.ai && <p className="muted small">Narrated by the AI DM</p>}
      </div>
      <PlayerStrip />
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
  const [frozen, setFrozen] = useState<{ monster: Monster; label: string; hp: number } | null>(null);
  const [line, setLine] = useState("");
  const [stat, setStat] = useState<Monster | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const loadQuestion = useCallback(async () => {
    const t0 = performance.now();
    const next = await nextFightQuestion(settings.selectedTags);
    setQ(next ?? null);
    (window as unknown as { __lastQuestionMs?: number }).__lastQuestionMs = performance.now() - t0;
  }, [settings.selectedTags]);

  useEffect(() => {
    void loadQuestion();
    void getStopNarration(adventure!, run!, run!.stopIndex, settings).then(setBundle);
    prefetchNext(adventure!, run!, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = currentFoe(run!, adventure!);
  const stop = currentStop(run!, adventure!)!;
  const shown = frozen ?? (cur ? { monster: cur.monster, label: cur.foe.label, hp: run!.foeHp } : null);

  const onResult = async (correct: boolean) => {
    const before = runRef.current!;
    const b = currentFoe(before, adventure!)!;
    await recordAnswer(q!, correct, "fight");
    const { run: after, event: ev } = answerInFight(before, adventure!, levels, settings.difficulty, q!.key, correct);
    const streak = await getStreak();
    ev.badges.push(...streakBadges(after.character, streak.count));
    setEvent(ev);
    setLine(pick(correct ? (bundle?.hitLines ?? adventure!.hitLines) : (bundle?.missLines ?? adventure!.missLines)));
    setFrozen({ monster: b.monster, label: b.foe.label, hp: ev.foeDefeated ? 0 : after.phase === "combat" ? after.foeHp : before.foeHp });
    if (correct) (ev.foeDefeated ? sfx.victory : sfx.hit)(settings.sound);
    else sfx.miss(settings.sound);
    if (ev.leveledUp) sfx.level(settings.sound);
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
    setQ(undefined);
    await loadQuestion();
  };

  if (!cur && !frozen) return <p>Nothing to fight here.</p>;
  const m = shown!.monster;
  const intro = bundle?.intros[m.id] ?? m.description ?? "";

  return (
    <>
      <TopBar title={stop.encounter.name} onBack={() => go("home")} />
      <section className="foe-card">
        <AssetImage kind="monster" id={m.id} label={m.name} icon={m.icon} editable />
        <div className="foe-info">
          <div className="foe-name">
            <h2>{shown!.label}</h2>
            <button className="btn small" onClick={() => setStat(m)}>Stat block</button>
          </div>
          <Bar kind="foe" value={shown!.hp} max={m.hp} label={`HP ${shown!.hp} / ${m.hp}`} />
          <p className="muted small">Hits you for {monsterDamage(m, settings.difficulty)} · {m.xp} XP</p>
          {!event && intro && <p className="dm-line">“{intro}”</p>}
        </div>
      </section>
      <PlayerStrip />

      {q === undefined && <p className="muted">Drawing a question…</p>}
      {q === null && (
        <div className="card">
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
          nextLabel={event?.knockedOut ? "You fall…" : event?.fightWon ? "Victory!" : "Next round"}
          flavor={event && <FightFlavor event={event} line={line} />}
        />
      )}
      {stat && <StatBlock monster={stat} onClose={() => setStat(null)} />}
    </>
  );
}

function FightFlavor({ event, line }: { event: FightEvent; line: string }) {
  return (
    <div className="flavor">
      <p className="dm-line">“{line}”</p>
      <p className={event.kind === "hit" ? "good-text" : "bad-text"}>
        {event.kind === "hit" ? `You deal ${event.damage} damage.` : `You take ${event.damage} damage.`}
      </p>
      {event.foeDefeated && <p className="good-text">⚔︎ {event.foeDefeated.name} is defeated! +{event.foeDefeated.xp} XP</p>}
      {event.leveledUp && <p className="level-up">⭐ Level up! You are now level {event.leveledUp}.</p>}
      {event.knockedOut && <p className="bad-text">Your vision goes dark…</p>}
      <BadgeList badges={event.badges} />
    </div>
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

  return (
    <>
      <TopBar title="Victory" onBack={() => go("home")} />
      <section className="card results">
        <h2>{stop.encounter.name} defeated</h2>
        <div className="stat-row">
          <div className="stat"><b>+{f.xp}</b><span>XP</span></div>
          <div className="stat"><b>{right}/{f.log.length}</b><span>correct</span></div>
          <div className="stat"><b>{lineup(stop, adventure!).length}</b><span>foes</span></div>
        </div>
        {f.leveledTo && <p className="level-up">⭐ You reached level {f.leveledTo}! Max HP {levelRow(f.leveledTo, levels).maxHp}, damage {levelRow(f.leveledTo, levels).damage}.</p>}
        <BadgeList badges={recent} />
      </section>
      {missed.length > 0 && (
        <section className="card">
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
      <PlayerStrip />
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
  const [msg, setMsg] = useState("");
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    void getRestNarration(adventure!, run!, settings).then(setStory);
    void nextMockQuestion(settings.selectedTags).then((x) => setItem(x ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = run!.character;
  const max = maxHp(c, levels);
  const onResult = async (correct: boolean) => {
    await recordAnswer(item!.q, correct, "mock");
    const before = runRef.current!;
    const after = answerInMock(before, levels, correct);
    if (after.character.hp > before.character.hp) {
      setHealed((h) => h + 1);
      sfx.heal(settings.sound);
    }
    setMsg(correct ? (after.character.hp > before.character.hp ? "+1 HP" : "Already at full health.") + (item!.marked ? " Mark cleared." : "") : "Still marked. Try it again later.");
    await setRun(after);
  };
  const onNext = async () => {
    setMsg("");
    setItem(undefined);
    setItem((await nextMockQuestion(settings.selectedTags)) ?? null);
  };

  return (
    <>
      <TopBar title={story?.place ?? "Safe place"} onBack={() => go("home")} />
      <div className="narration rest">
        {story ? <RichText text={story.text} /> : <p className="muted">…</p>}
      </div>
      <PlayerStrip />
      <section className="card">
        <h3>Mock combat</h3>
        <p className="muted small">
          {item?.marked ? "Marked questions only. A correct answer heals 1 HP and clears the mark." : "No marked questions: random questions from your upload. Each correct answer heals 1 HP."}
          {healed > 0 && ` Healed ${healed} HP this rest.`}
        </p>
        {c.hp >= max && <p className="good-text">You are at full health.</p>}
      </section>
      {item === undefined && <p className="muted">…</p>}
      {item === null && <p>No questions available. Upload questions first.</p>}
      {item && (
        <QuestionCard q={item.q} settings={settings} marked={item.marked} onResult={onResult} onNext={onNext} nextLabel="Next question" flavor={msg ? <p className="flavor good-text">{msg}</p> : undefined} />
      )}
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
      <AssetImage kind="location" id="__ending" label={adventure!.title} icon="🏆" />
      <div className="narration">{text ? <RichText text={text} /> : <p className="muted">…</p>}</div>
      <section className="card">
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
      <p>Your hero has grown stronger. Upload an upgraded picture (better armour, new gear) or keep the current one. Earlier pictures stay in your level history.</p>
      <div className="row">
        <button className="btn primary" onClick={() => ref.current?.click()}>Upload new picture</button>
        <button className="btn" onClick={() => done()}>Keep current</button>
      </div>
      <p className="muted small">AI-generated upgrades (keeping your character recognisable) are planned for the image-generation phase.</p>
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
