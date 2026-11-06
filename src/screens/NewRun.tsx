import { useRef, useState } from "react";
import { useApp } from "../App";
import { TopBar } from "../components/ui";
import { heroPalette, spriteUrl } from "../art/sprites";
import { newRun } from "../lib/engine";
import { storeImage } from "../lib/images";
import { deleteRun, saveAdventure, validateAdventure } from "../lib/store";
import type { Adventure } from "../lib/types";

export function NewRun() {
  const { adventures, adventure, openAdventure, refreshAdventures, levels, setRun, go, run } = useApp();
  const [advId, setAdvId] = useState(adventure?.id ?? adventures[0]?.id);
  const [name, setName] = useState(run?.character.name ?? "");
  const [portrait, setPortrait] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [err, setErr] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const advFileRef = useRef<HTMLInputElement>(null);

  const adv = adventures.find((a) => a.id === advId);

  const start = async () => {
    if (!adv || !name.trim()) return;
    await deleteRun(adv.id);
    let portraitId: string | undefined;
    if (portrait) {
      portraitId = `portrait:${adv.id}:${Date.now()}`;
      await storeImage(portraitId, portrait, "portrait", 800);
    }
    await openAdventure(adv.id);
    await setRun(newRun(adv, name.trim(), levels, portraitId));
    go("play");
  };

  const importAdventure = async (f: File) => {
    try {
      const a = JSON.parse(await f.text()) as Adventure;
      const errs = validateAdventure(a);
      if (errs.length) return setErr(`Adventure file has problems:\n• ${errs.join("\n• ")}`);
      await saveAdventure(a);
      await refreshAdventures();
      setAdvId(a.id);
      setErr(undefined);
    } catch (e) {
      setErr(`Could not read adventure: ${(e as Error).message}`);
    }
  };

  return (
    <main className="screen">
      <TopBar title="New adventure" onBack={() => go("home")} />
      <section className="card">
        <h3>1. Adventure</h3>
        {adventures.map((a) => (
          <button key={a.id} className={`list-btn ${a.id === advId ? "active" : ""}`} onClick={() => setAdvId(a.id)}>
            <b>{a.title}</b>
            <small>{a.stops.length} fights · {a.chapters.length} chapters · starts at level {a.recommendedLevel}</small>
          </button>
        ))}
        <div className="row">
          <button className="btn" onClick={() => go("import")}>Import a module (PDF)</button>
          {adv && <button className="btn" onClick={async () => { await openAdventure(adv.id); go("art"); }}>Art checklist</button>}
          <button className="btn small ghost" onClick={() => advFileRef.current?.click()}>Adventure file (.json)</button>
        </div>
        <input ref={advFileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importAdventure(e.target.files[0])} />
        {adv && <p className="muted">{adv.synopsis}</p>}
        {err && <pre className="error">{err}</pre>}
      </section>

      <section className="card">
        <h3>2. Your character</h3>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sir Andrea" maxLength={40} />
        </label>
        <div className="portrait-pick">
          {preview ? <img src={preview} className="portrait" alt="Portrait preview" /> : <img className="pixel ph" src={spriteUrl("hero", heroPalette(adv?.recommendedLevel ?? 1))} alt="" />}
          <div>
            <button className="btn" onClick={() => fileRef.current?.click()}>{portrait ? "Change picture" : "Upload a picture"}</button>
            <p className="muted small">Optional. In battle you appear as the pixel knight; the portrait shows on your character sheet.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setPortrait(f);
                setPreview(URL.createObjectURL(f));
              }
            }}
          />
        </div>
      </section>

      {run && run.adventureId === advId && run.phase !== "done" && (
        <p className="notice">Starting again replaces your current progress in this adventure (your study marks and stats are kept).</p>
      )}
      <button className="btn primary big" disabled={!adv || !name.trim()} onClick={start}>Begin</button>
    </main>
  );
}
