import { useRef, useState } from "react";
import { useApp } from "../App";
import { TopBar } from "../components/ui";
import { IS_ARTIFACT_BUILD } from "../lib/platform";
import { ImportCancelled, importModule, type ImportStep } from "../lib/moduleImport";
import { setModulePdf } from "../lib/pdfSession";
import { saveAdventure } from "../lib/store";
import type { Adventure, Monster, Stop } from "../lib/types";

const ERR: Record<string, string> = {
  not_granted: "Claude wasn't allowed to run. Allow it when asked, then try again.",
  sampling_disabled: "Claude isn't available for this account.",
  rate_limited: "Too many requests to Claude right now. Wait a little and try again.",
  prompt_too_large: "A part of the module was too large to send. Try a smaller PDF.",
  invalid_json: "Claude's answer couldn't be read. Try again.",
  refused: "Claude declined to process this module.",
  no_text: "No readable text was found in this PDF.",
  no_stops: "Claude couldn't find any fights in this module.",
  unavailable: "Claude isn't available in this view. Open the game on claude.ai.",
};

export function ImportModule() {
  const { go, refreshAdventures, openAdventure } = useApp();
  const [step, setStep] = useState<ImportStep | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [draft, setDraft] = useState<Adventure | null>(null);
  const [fileName, setFileName] = useState("");
  const ctl = useRef<AbortController | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const run = async (f: File) => {
    setError("");
    setDraft(null);
    setFileName(f.name);
    ctl.current = new AbortController();
    try {
      const out = await importModule(f, setStep, ctl.current.signal);
      setModulePdf(out.pdf);
      setWarnings(out.warnings);
      setDraft(out.adventure);
    } catch (e) {
      if (e instanceof ImportCancelled) setError("Import stopped.");
      else {
        const code = (e as { code?: string }).code ?? "";
        setError(ERR[code] ?? `The import failed: ${(e as { message?: string }).message ?? code}`);
      }
    } finally {
      setStep(null);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    draft.stops.forEach((s, i) => {
      s.id = `s${i + 1}`;
      s.encounter.id = `e${i + 1}`;
    });
    await saveAdventure(draft);
    await refreshAdventures();
    await openAdventure(draft.id);
    go("art");
  };

  return (
    <main className="screen">
      <TopBar title="Import a module" onBack={() => go("newrun")} />
      {!draft && (
        <section className="parchment">
          <h2>Turn your adventure book into a run</h2>
          <p>
            Choose the PDF of a D&D adventure you own. It is read on this device; Claude then reads its text to find the locations, fights, monsters, stat blocks and safe places, in story order. You can check and change everything before playing.
          </p>
          <p className="muted small">
            Takes one to a few minutes depending on length, and uses your Claude usage. The PDF itself is not stored or shared; the finished adventure is saved to your account.
          </p>
          {!IS_ARTIFACT_BUILD && <p className="notice">Module import needs the Claude artifact version of the game.</p>}
          {step ? (
            <div className="progress">
              <p>
                <b>{step.label}</b> {step.total > 1 ? `${step.done} / ${step.total}` : "…"}
              </p>
              <div className="meter"><div className="meter-fill" style={{ width: `${step.total ? (100 * step.done) / step.total : 0}%` }} /></div>
              <button className="btn small" onClick={() => ctl.current?.abort()}>Stop</button>
            </div>
          ) : (
            <button className="btn primary wide" disabled={!IS_ARTIFACT_BUILD} onClick={() => ref.current?.click()}>
              Choose the module PDF
            </button>
          )}
          <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(f); }} />
          {error && <p className="notice">{error}</p>}
        </section>
      )}
      {draft && <OutlineEditor draft={draft} setDraft={setDraft} warnings={warnings} fileName={fileName} onSave={saveDraft} onDiscard={() => setDraft(null)} />}
    </main>
  );
}

function OutlineEditor({ draft, setDraft, warnings, fileName, onSave, onDiscard }: {
  draft: Adventure; setDraft: (a: Adventure) => void; warnings: string[]; fileName: string; onSave: () => void; onDiscard: () => void;
}) {
  const up = (fn: (a: Adventure) => void) => {
    const a = structuredClone(draft);
    fn(a);
    setDraft(a);
  };
  const moveStop = (i: number, d: -1 | 1) => up((a) => {
    const j = i + d;
    if (j < 0 || j >= a.stops.length) return;
    [a.stops[i], a.stops[j]] = [a.stops[j], a.stops[i]];
  });
  const setStop = (i: number, patch: Partial<Stop>) => up((a) => Object.assign(a.stops[i], patch));
  const setMon = (id: string, patch: Partial<Monster>) => up((a) => Object.assign(a.monsters[id], patch));
  const used = new Set(draft.stops.flatMap((s) => s.encounter.monsters.map((g) => g.monsterId)));

  return (
    <>
      <section className="parchment">
        <h2>Check the outline</h2>
        <p className="muted small">From {fileName}. Fix or remove anything that's wrong; nothing is saved until you press Save.</p>
        {warnings.length > 0 && (
          <ul className="issues">
            {warnings.map((w, i) => <li key={i} className="warning"><b>Note</b> {w}</li>)}
          </ul>
        )}
        <label className="field"><span>Title</span><input value={draft.title} onChange={(e) => up((a) => (a.title = e.target.value))} /></label>
        <label className="field"><span>Starting level</span><input type="number" min={1} max={20} value={draft.recommendedLevel} onChange={(e) => up((a) => (a.recommendedLevel = Math.max(1, Math.min(20, +e.target.value || 1))))} /></label>
        <label className="field"><span>Summary (used by Claude for narration)</span><textarea rows={3} value={draft.synopsis} onChange={(e) => up((a) => (a.synopsis = e.target.value))} /></label>
      </section>

      {draft.chapters.map((ch) => (
        <section className="parchment" key={ch.id}>
          <input className="chapter-input" value={ch.title} onChange={(e) => up((a) => (a.chapters.find((c) => c.id === ch.id)!.title = e.target.value))} aria-label="Chapter title" />
          {draft.stops.map((s, i) => s.chapterId !== ch.id ? null : (
            <div className="outline-stop" key={`${s.id}-${i}`}>
              <div className="outline-head">
                <span className="map-dot">{i + 1}</span>
                <input value={s.location} onChange={(e) => setStop(i, { location: e.target.value })} aria-label="Location" />
                <div className="row">
                  <button className="btn small" onClick={() => moveStop(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="btn small" onClick={() => moveStop(i, 1)} disabled={i === draft.stops.length - 1} aria-label="Move down">↓</button>
                  <button className="btn small ghost" onClick={() => up((a) => a.stops.splice(i, 1))} disabled={draft.stops.length === 1}>Remove</button>
                </div>
              </div>
              <label className="field"><span>Fight</span><input value={s.encounter.name} onChange={(e) => up((a) => (a.stops[i].encounter.name = e.target.value))} /></label>
              <div className="outline-mons">
                {s.encounter.monsters.map((g, k) => (
                  <span key={k} className="chip">
                    <input type="number" min={1} max={12} value={g.count} onChange={(e) => up((a) => (a.stops[i].encounter.monsters[k].count = Math.max(1, Math.min(12, +e.target.value || 1))))} aria-label="How many" />
                    × {draft.monsters[g.monsterId]?.name}
                    {s.encounter.monsters.length > 1 && <button className="chip-x" onClick={() => up((a) => a.stops[i].encounter.monsters.splice(k, 1))} aria-label="Remove monster">✕</button>}
                  </span>
                ))}
                <label className="check small"><input type="checkbox" checked={!!s.encounter.boss} onChange={(e) => up((a) => (a.stops[i].encounter.boss = e.target.checked))} /> Boss</label>
                <select value={s.chapterId} onChange={(e) => setStop(i, { chapterId: e.target.value })} aria-label="Chapter">
                  {draft.chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <details>
                <summary className="small">Narration</summary>
                <textarea rows={3} value={s.narration} onChange={(e) => setStop(i, { narration: e.target.value })} />
              </details>
            </div>
          ))}
        </section>
      ))}

      <section className="parchment">
        <h3>Monsters and stat blocks</h3>
        <p className="muted small">HP sets how long a fight lasts; damage is what a wrong answer costs you (before the difficulty setting); XP is earned on a kill. Check the ones not taken from the module.</p>
        <div className="table-wrap">
          <table className="stats-table">
            <thead><tr><th>Monster</th><th>HP</th><th>Damage</th><th>XP</th><th>Source</th></tr></thead>
            <tbody>
              {Object.values(draft.monsters).map((m) => (
                <tr key={m.id} className={used.has(m.id) ? "" : "muted"}>
                  <td><input value={m.name} onChange={(e) => setMon(m.id, { name: e.target.value })} aria-label="Name" /></td>
                  <td><input type="number" min={1} value={m.hp} onChange={(e) => setMon(m.id, { hp: Math.max(1, +e.target.value || 1) })} aria-label="Hit points" /></td>
                  <td><input type="number" min={0} value={m.hitDamage} onChange={(e) => setMon(m.id, { hitDamage: Math.max(0, +e.target.value || 0) })} aria-label="Damage" /></td>
                  <td><input type="number" min={0} value={m.xp} onChange={(e) => setMon(m.id, { xp: Math.max(0, +e.target.value || 0) })} aria-label="XP" /></td>
                  <td className={/module/i.test(m.source) ? "small" : "small bad-text"}>{m.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="parchment">
        <h3>Places to rest</h3>
        {draft.safePlaces.map((p, i) => (
          <label className="field" key={p.id}>
            <span>Safe place {i + 1}</span>
            <input value={p.name} onChange={(e) => up((a) => (a.safePlaces[i].name = e.target.value))} />
          </label>
        ))}
      </section>

      <div className="menu">
        <button className="btn primary big" onClick={onSave}>Save and choose the art</button>
        <button className="btn" onClick={onDiscard}>Discard and start over</button>
      </div>
    </>
  );
}
