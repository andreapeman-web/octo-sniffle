import { useRef } from "react";
import { useApp } from "../App";
import { Bar, Placeholder, StoredImg, TopBar } from "../components/ui";
import { heroPalette, spriteUrl } from "../art/sprites";
import { levelRow, maxHp, nextLevelXp, playerDamage } from "../lib/engine";
import { storeImage } from "../lib/images";

export function CharacterScreen() {
  const { run, levels, go, setRun } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  if (!run) return null;
  const c = run.character;
  const next = nextLevelXp(c.level, levels);
  const base = levelRow(c.level, levels).xp;
  return (
    <main className="screen">
      <TopBar title="Character" onBack={() => go(run.phase === "done" ? "home" : "play")} />
      <section className="card char-sheet">
        <StoredImg id={c.portraitId} alt={c.name} className="portrait big-portrait" fallback={<img className="pixel portrait big-portrait" src={spriteUrl("hero", heroPalette(c.level))} alt="" />} />
        <h2>{c.name}</h2>
        <p className="muted">Level {c.level} · {playerDamage(c, levels)} damage per correct answer</p>
        <Bar kind="hp" value={c.hp} max={maxHp(c, levels)} label={`HP ${c.hp} / ${maxHp(c, levels)}`} />
        <Bar kind="xp" value={c.xp - base} max={next ? next - base : 1} label={next ? `XP ${c.xp} / ${next}` : `XP ${c.xp} (max)`} />
        <button className="btn small" onClick={() => ref.current?.click()}>Replace picture</button>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const id = `portrait:${run.adventureId}:${Date.now()}`;
            await storeImage(id, f, "portrait", 800);
            const r = structuredClone(run);
            r.character.portraitId = id;
            r.character.portraitHistory.push({ level: c.level, imageId: id, at: Date.now() });
            await setRun(r);
          }}
        />
      </section>

      <section className="card">
        <h3>Badges & trophies ({c.badges.length})</h3>
        {c.badges.length === 0 && <p className="muted">Defeat bosses, clear locations, level up and keep a study streak to earn badges. They are for looks only.</p>}
        <div className="badge-grid">
          {c.badges.map((b) => (
            <div key={b.id} className="badge-tile" title={new Date(b.earnedAt).toLocaleDateString()}>
              <span className="badge-icon">{b.icon}</span>
              <span>{b.name}</span>
            </div>
          ))}
        </div>
      </section>

      {c.portraitHistory.length > 0 && (
        <section className="card">
          <h3>Level history</h3>
          <div className="history">
            {c.portraitHistory.map((p) => (
              <figure key={p.imageId}>
                <StoredImg id={p.imageId} alt={`Level ${p.level}`} className="portrait" fallback={<Placeholder kind="portrait" label={c.name} />} />
                <figcaption>Level {p.level}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
