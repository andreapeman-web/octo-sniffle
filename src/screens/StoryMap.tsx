import { useApp } from "../App";
import { TopBar } from "../components/ui";
import { lineup } from "../lib/engine";

export function StoryMap() {
  const { run, adventure, go } = useApp();
  if (!run || !adventure) return null;
  const totalMonsters = adventure.stops.reduce((a, s) => a + lineup(s, adventure).length, 0);
  const locations = [...new Set(adventure.stops.map((s) => s.locationId))];
  return (
    <main className="screen">
      <TopBar title="Story map" onBack={() => go(run.phase === "done" ? "home" : "play")} />
      <div className="stat-row">
        <div className="stat"><b>{run.stats.visited.length}/{locations.length}</b><span>locations</span></div>
        <div className="stat"><b>{run.stats.defeated.length}/{totalMonsters}</b><span>monsters</span></div>
        <div className="stat"><b>{Math.min(run.stopIndex, adventure.stops.length)}/{adventure.stops.length}</b><span>fights won</span></div>
      </div>
      {adventure.chapters.map((ch) => {
        const stops = adventure.stops.map((s, i) => ({ s, i })).filter((x) => x.s.chapterId === ch.id);
        return (
          <section className="card" key={ch.id}>
            <h3>{ch.title}</h3>
            <ol className="map">
              {stops.map(({ s, i }) => {
                const state = i < run.stopIndex ? "done" : i === run.stopIndex && run.phase !== "done" ? "current" : "todo";
                return (
                  <li key={s.id} className={`map-stop ${state}`}>
                    <span className="map-dot">{state === "done" ? "✓" : state === "current" ? "➤" : ""}</span>
                    <div>
                      <b>{s.location}</b>
                      <small>
                        {s.encounter.boss ? "👑 " : ""}
                        {state === "todo" ? "???" : s.encounter.monsters.map((m) => `${m.count}× ${adventure.monsters[m.monsterId]?.name}`).join(", ")}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </main>
  );
}
