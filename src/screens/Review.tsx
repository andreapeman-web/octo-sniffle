import { useEffect, useState } from "react";
import { useApp } from "../App";
import { RichText, StoredImg, TopBar } from "../components/ui";
import { getMarks } from "../lib/questions";
import type { Mark } from "../lib/types";

export function Review() {
  const { go, upload } = useApp();
  const [marks, setMarks] = useState<Mark[]>();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  useEffect(() => {
    void getMarks().then(setMarks);
  }, []);
  const tags = [...new Set((marks ?? []).flatMap((m) => m.snapshot.tags))].sort();
  const list = (marks ?? []).filter((m) => !filter || m.snapshot.tags.includes(filter));

  return (
    <main className="screen">
      <TopBar title={`Review (${marks?.length ?? 0})`} onBack={() => go("home")} />
      <p className="muted">
        Questions you got wrong stay marked until you answer them correctly in a mock combat (rest at a safe place). Marks from earlier uploads are kept too.
      </p>
      {tags.length > 1 && (
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by topic">
          <option value="">All topics</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
      )}
      {marks && marks.length === 0 && <p className="card">Nothing marked. Well done!</p>}
      {list.map((m) => {
        const q = m.snapshot;
        const isOpen = open === m.key;
        return (
          <section className="card review-item" key={m.key}>
            <div className="qmeta">
              {q.tags.map((t) => <span className="chip" key={t}>{t}</span>)}
              <span className="chip chip-mark">wrong ×{m.wrongCount}</span>
              {upload && !m.key.startsWith("fp:") && <span className="muted small">{q.id}</span>}
            </div>
            <RichText text={q.question} />
            {(q.imageId || q.imageUrl) && <div className="qimg"><StoredImg id={q.imageId} url={q.imageUrl} alt="Question image" /></div>}
            {q.options.length > 0 && q.type !== "truefalse" && (
              <ol className="review-opts" type="A">
                {q.options.map((o, i) => <li key={i} className={isOpen && q.correct.includes(i) ? "good-text" : ""}><RichText text={o} /></li>)}
              </ol>
            )}
            {isOpen ? (
              <>
                <div className="answer-box"><span className="label">Answer</span><RichText text={q.answerText} /></div>
                {q.explanation && <div className="answer-box"><span className="label">Explanation (your file)</span><RichText text={q.explanation} /></div>}
                {q.source && <p className="muted small">Source: {q.source}</p>}
              </>
            ) : (
              <button className="btn small" onClick={() => setOpen(m.key)}>Show answer</button>
            )}
          </section>
        );
      })}
    </main>
  );
}
