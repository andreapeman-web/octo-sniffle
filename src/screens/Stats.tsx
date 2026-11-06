import { useEffect, useState } from "react";
import { useApp } from "../App";
import { TopBar } from "../components/ui";
import { db } from "../lib/db";
import { getStreak, type Streak } from "../lib/questions";
import type { TopicStat } from "../lib/types";

export function Stats() {
  const { go, upload } = useApp();
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [streak, setStreak] = useState<Streak>();
  const [marksByTag, setMarksByTag] = useState<Record<string, number>>({});
  useEffect(() => {
    void (async () => {
      const d = await db();
      setTopics(await d.getAll("topics"));
      setStreak(await getStreak());
      const m: Record<string, number> = {};
      for (const x of await d.getAll("marks")) for (const t of x.snapshot.tags) m[t] = (m[t] ?? 0) + 1;
      setMarksByTag(m);
    })();
  }, []);

  const total = topics.reduce((a, t) => ({ answered: a.answered + t.answered, correct: a.correct + t.correct }), { answered: 0, correct: 0 });
  const pct = (t: { answered: number; correct: number }) => (t.answered ? Math.round((100 * t.correct) / t.answered) : 0);
  const weak = topics.filter((t) => t.answered >= 5).sort((a, b) => pct(a) - pct(b)).slice(0, 5).filter((t) => pct(t) < 75);
  const inUpload = new Set(upload?.tags ?? []);

  return (
    <main className="screen">
      <TopBar title="Stats" onBack={() => go("home")} />
      <div className="stat-row">
        <div className="stat"><b>{pct(total)}%</b><span>accuracy</span></div>
        <div className="stat"><b>{streak?.count ?? 0}</b><span>day streak (best {streak?.best ?? 0})</span></div>
        <div className="stat"><b>{streak?.days ?? 0}</b><span>study days</span></div>
      </div>
      <p className="muted small">Answers per topic count once per tag, so a question with two tags counts in both.</p>

      {weak.length > 0 && (
        <section className="card">
          <h3>Weak areas</h3>
          <p className="muted small">Topics with at least 5 answers and under 75% correct.</p>
          {weak.map((t) => (
            <div className="topic-row" key={t.tag}>
              <span>{t.tag}</span>
              <div className="meter"><div style={{ width: `${pct(t)}%` }} className="meter-bad" /></div>
              <b>{pct(t)}%</b>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3>Accuracy per topic</h3>
        {topics.length === 0 && <p className="muted">No answers yet.</p>}
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr><th>Topic</th><th>Answered</th><th>Correct</th><th>%</th><th>Marked</th></tr>
            </thead>
            <tbody>
              {[...topics].sort((a, b) => b.answered - a.answered).map((t) => (
                <tr key={t.tag} className={inUpload.has(t.tag) ? "" : "muted"}>
                  <td>{t.tag}</td><td>{t.answered}</td><td>{t.correct}</td><td>{pct(t)}%</td><td>{marksByTag[t.tag] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Greyed topics are not in the current upload.</p>
      </section>
    </main>
  );
}
