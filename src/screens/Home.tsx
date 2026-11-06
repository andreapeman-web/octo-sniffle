import { useEffect, useState } from "react";
import { useApp } from "../App";
import { Bar, Placeholder, StoredImg } from "../components/ui";
import { levelRow, nextLevelXp } from "../lib/engine";
import { getStreak, markCount, type Streak } from "../lib/questions";
import { kvGet } from "../lib/db";
import { onSyncStatus, syncStatus } from "../lib/sync";
import { IS_ARTIFACT_BUILD } from "../lib/platform";

const BACKUP_EVERY_DAYS = 7;

export function Home() {
  const { run, adventure, adventures, openAdventure, levels, upload, go } = useApp();
  const [marks, setMarks] = useState(0);
  const [streak, setStreak] = useState<Streak>();
  const [lastExport, setLastExport] = useState<number | undefined>();
  const [sync, setSync] = useState(syncStatus());
  useEffect(() => onSyncStatus(setSync), []);

  useEffect(() => {
    void markCount().then(setMarks);
    void getStreak().then(setStreak);
    void kvGet<number>("lastExport").then(setLastExport);
    // Re-read after account sync replaces the local copy (the run object changes then).
  }, [run, sync]);

  const c = run?.character;
  const nextXp = c ? nextLevelXp(c.level, levels) : null;
  const curXp = c ? levelRow(c.level, levels).xp : 0;
  // With account sync the reminder is less urgent: remind every 30 days instead of 7.
  const every = sync === "synced" ? 30 : BACKUP_EVERY_DAYS;
  const backupDue = run && (!lastExport || Date.now() - lastExport > every * 86_400_000);

  return (
    <main className="screen home">
      <header className="home-head">
        <h1>Study RPG</h1>
        <button className="icon-btn" onClick={() => go("settings")} aria-label="Settings">⚙︎</button>
      </header>

      {backupDue && (
        <div className="notice">
          <span>{lastExport ? `Last backup ${Math.floor((Date.now() - lastExport) / 86_400_000)} days ago.` : "You have never exported a backup."} {sync === "synced" ? "Your progress syncs to your Claude account; a backup file is an extra copy." : "iOS can delete app data when storage runs low."}</span>
          <button className="btn small" onClick={() => go("settings")}>Back up</button>
        </div>
      )}

      {c && adventure ? (
        <section className="card hero-card">
          <button className="portrait-btn" onClick={() => go("character")} aria-label="Character">
            <StoredImg id={c.portraitId} alt={c.name} className="portrait" fallback={<Placeholder kind="portrait" label={c.name} icon="🛡️" />} />
          </button>
          <div className="hero-info">
            <h2>{c.name}</h2>
            <p className="muted">Level {c.level} · {adventure.title}</p>
            <Bar kind="hp" value={c.hp} max={levelRow(c.level, levels).maxHp} label={`HP ${c.hp} / ${levelRow(c.level, levels).maxHp}`} />
            <Bar kind="xp" value={c.xp - curXp} max={nextXp ? nextXp - curXp : 1} label={nextXp ? `XP ${c.xp} / ${nextXp}` : `XP ${c.xp} (max level)`} />
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Welcome</h2>
          <p>Answer your own exam questions to fight through an adventure. Correct answers hit; wrong answers hurt and come back for review.</p>
        </section>
      )}

      {IS_ARTIFACT_BUILD && (
        <p className={`sync-line sync-${sync}`}>
          {sync === "synced" ? "● Progress saved to your Claude account" : sync === "connecting" ? "○ Connecting to your account…" : sync === "error" ? "● Account sync unavailable, saving in this browser" : "● Saving in this browser only"}
        </p>
      )}
      <div className="stat-row">
        <div className="stat"><b>{streak?.count ?? 0}</b><span>day streak</span></div>
        <div className="stat"><b>{marks}</b><span>marked</span></div>
        <div className="stat"><b>{upload?.count ?? 0}</b><span>questions loaded</span></div>
      </div>

      <div className="menu">
        {run && run.phase !== "done" ? (
          <button className="btn primary big" onClick={() => go(upload?.count ? "play" : "upload")}>
            {upload?.count ? "Continue adventure" : "Upload questions to continue"}
          </button>
        ) : (
          <button className="btn primary big" onClick={() => go("newrun")}>
            {run?.phase === "done" ? "Start a new run" : "Start an adventure"}
          </button>
        )}
        <button className="btn big" onClick={() => go("upload")}>
          {upload ? "Upload today's questions" : "Upload questions"}
          {upload && <small>Current: {upload.title} ({upload.count})</small>}
        </button>
        <div className="grid2">
          <button className="btn" onClick={() => go("review")}>Review ({marks})</button>
          <button className="btn" onClick={() => go("map")} disabled={!run}>Story map</button>
          <button className="btn" onClick={() => go("stats")}>Stats</button>
          <button className="btn" onClick={() => go("character")} disabled={!run}>Character</button>
        </div>
      </div>

      {adventures.length > 1 && (
        <section className="card">
          <h3>Library</h3>
          {adventures.map((a) => (
            <button key={a.id} className={`list-btn ${a.id === adventure?.id ? "active" : ""}`} onClick={() => openAdventure(a.id)}>
              {a.title}
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
