import { useEffect, useRef, useState, type ReactNode } from "react";
import { explainFromAI, gradeTyped, type ExplainResult } from "../lib/ai";
import { normaliseAnswer } from "../lib/parse";
import type { Question, Settings } from "../lib/types";
import { RichText, StoredImg } from "./ui";

type Stage = "ask" | "grading" | "selfgrade" | "aiverdict" | "feedback";

interface Props {
  q: Question;
  settings: Settings;
  /** Called once per question when the result is final. Must persist the answer. */
  onResult: (correct: boolean) => void | Promise<void>;
  onNext: () => void;
  /** Shown above the answer feedback (e.g. combat line). */
  flavor?: ReactNode;
  nextLabel?: string;
  marked?: boolean;
}

export function QuestionCard({ q, settings, onResult, onNext, flavor, nextLabel = "Continue", marked }: Props) {
  const [stage, setStage] = useState<Stage>("ask");
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [aiVerdict, setAiVerdict] = useState<{ ok: boolean; feedback: string } | null>(null);
  const [explain, setExplain] = useState<ExplainResult | "loading" | null>(null);
  const committed = useRef(false);
  const nextBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setStage("ask");
    setPicked([]);
    setTyped("");
    setCorrect(null);
    setAiVerdict(null);
    setExplain(null);
    committed.current = false;
  }, [q.key]);

  useEffect(() => {
    if (stage === "feedback") nextBtn.current?.focus();
  }, [stage]);

  const commit = async (ok: boolean) => {
    if (committed.current) return;
    committed.current = true;
    setCorrect(ok);
    setStage("feedback");
    await onResult(ok);
    if (!ok && !q.explanation) {
      setExplain("loading");
      setExplain(await explainFromAI(settings, q));
    }
  };

  const submitChoice = (sel: number[]) => {
    const a = [...sel].sort((x, y) => x - y);
    const ok = a.length === q.correct.length && a.every((v, i) => v === q.correct[i]);
    setPicked(a);
    void commit(ok);
  };

  const submitTyped = async () => {
    if (!typed.trim()) return;
    const exact = normaliseAnswer(typed) === normaliseAnswer(q.answerText);
    setStage("grading");
    const g = await gradeTyped(settings, q, typed, exact);
    if (g.source === "offline") {
      if (g.exact) void commit(true);
      else setStage("selfgrade");
    } else {
      setAiVerdict({ ok: g.satisfactory, feedback: g.feedback });
      setStage("aiverdict");
    }
  };

  const optClass = (i: number) => {
    if (stage !== "feedback") return picked.includes(i) ? "opt picked" : "opt";
    if (q.correct.includes(i)) return "opt right";
    if (picked.includes(i)) return "opt wrong";
    return "opt dim";
  };

  return (
    <div className="qcard">
      <div className="qmeta">
        {q.tags.map((t) => <span className="chip" key={t}>{t}</span>)}
        {marked && <span className="chip chip-mark">marked</span>}
      </div>
      <RichText text={q.question} className="qtext" />
      {(q.imageId || q.imageUrl) && (
        <div className="qimg">
          <StoredImg id={q.imageId} url={q.imageUrl} alt="Question image" fallback={<p className="muted">Image could not be loaded.</p>} />
        </div>
      )}

      {(q.type === "single" || q.type === "truefalse") && (
        <div className={`opts ${q.type === "truefalse" ? "opts-tf" : ""}`}>
          {q.options.map((o, i) => (
            <button key={i} className={optClass(i)} disabled={stage !== "ask"} onClick={() => submitChoice([i])}>
              {q.type !== "truefalse" && <b className="opt-letter">{String.fromCharCode(65 + i)}</b>}
              <RichText text={o} />
            </button>
          ))}
        </div>
      )}

      {q.type === "multi" && (
        <>
          <p className="muted small">Select all that apply ({q.correct.length > 1 ? "more than one may be correct" : "one or more"}).</p>
          <div className="opts">
            {q.options.map((o, i) => (
              <button
                key={i}
                className={optClass(i)}
                aria-pressed={picked.includes(i)}
                disabled={stage !== "ask"}
                onClick={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}
              >
                <b className="opt-letter">{picked.includes(i) && stage === "ask" ? "✓" : String.fromCharCode(65 + i)}</b>
                <RichText text={o} />
              </button>
            ))}
          </div>
          {stage === "ask" && (
            <button className="btn primary wide" disabled={picked.length === 0} onClick={() => submitChoice(picked)}>
              Submit answer
            </button>
          )}
        </>
      )}

      {q.type === "typed" && (
        <div className="typed">
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your answer…"
            rows={3}
            disabled={stage !== "ask"}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitTyped();
            }}
          />
          {stage === "ask" && (
            <button className="btn primary wide" disabled={!typed.trim()} onClick={submitTyped}>
              Submit answer
            </button>
          )}
          {stage === "grading" && <p className="muted">The DM is checking your answer…</p>}
          {stage === "selfgrade" && (
            <div className="selfgrade">
              <p className="muted small">Offline: compare with the reference answer from your file.</p>
              <div className="answer-box">
                <span className="label">Reference answer</span>
                <RichText text={q.answerText} />
              </div>
              <div className="row">
                <button className="btn good" onClick={() => commit(true)}>My answer was right</button>
                <button className="btn bad" onClick={() => commit(false)}>It was wrong</button>
              </div>
            </div>
          )}
          {stage === "aiverdict" && aiVerdict && (
            <div className="selfgrade">
              <p className={aiVerdict.ok ? "verdict good-text" : "verdict bad-text"}>
                {aiVerdict.ok ? "Satisfactory" : "Not satisfactory"} — {aiVerdict.feedback}
              </p>
              <div className="answer-box">
                <span className="label">Reference answer (your file)</span>
                <RichText text={q.answerText} />
              </div>
              <div className="row">
                <button className="btn primary" onClick={() => commit(aiVerdict.ok)}>Accept</button>
                <button className="btn" onClick={() => commit(!aiVerdict.ok)}>
                  Disagree: count as {aiVerdict.ok ? "wrong" : "right"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "feedback" && correct !== null && (
        <div className={`feedback ${correct ? "fb-good" : "fb-bad"}`} aria-live="polite">
          {flavor}
          <p className="fb-title">{correct ? "Correct" : "Wrong — this question is now marked for review"}</p>
          {(!correct || q.type === "typed") && (
            <div className="answer-box">
              <span className="label">Correct answer</span>
              <RichText text={q.answerText} />
            </div>
          )}
          {q.explanation ? (
            <div className="answer-box">
              <span className="label">Explanation (your file)</span>
              <RichText text={q.explanation} />
            </div>
          ) : !correct ? (
            <div className="answer-box ai-box">
              {explain === "loading" && <p className="muted">Looking for a reliable explanation…</p>}
              {explain && explain !== "loading" && explain.kind === "ai" && (
                <>
                  <span className="label warn">AI explanation, not from your question file</span>
                  <RichText text={explain.text} />
                </>
              )}
              {explain && explain !== "loading" && explain.kind === "cannot" && (
                <p>I can't explain this reliably. Use the reference answer above and check your sources.</p>
              )}
              {explain && explain !== "loading" && explain.kind === "unavailable" && (
                <p className="muted">No explanation in your file (AI explanation unavailable offline).</p>
              )}
            </div>
          ) : null}
          {q.source && <p className="muted small">Source: {q.source}</p>}
          <button ref={nextBtn} className="btn primary wide" onClick={onNext}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
