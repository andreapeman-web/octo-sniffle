import { useRef, useState } from "react";
import { useApp } from "../App";
import { TopBar } from "../components/ui";
import { mergeResults, parseQuestionFile, type ParseResult } from "../lib/parse";
import { importUpload } from "../lib/questions";

export function Upload() {
  const { go, refreshUpload, upload, updateSettings, run } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [result, setResult] = useState<ParseResult>();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);

  const check = async (list: FileList | File[]) => {
    const all = [...list];
    const qFiles = all.filter((f) => /\.(json|csv|tsv|txt)$/i.test(f.name));
    const imgs = new Map(all.filter((f) => f.type.startsWith("image/")).map((f) => [f.name.toLowerCase(), f]));
    setFiles(qFiles);
    setImages(imgs);
    setDone(undefined);
    const parsed = await Promise.all(qFiles.map(async (f) => ({ file: f.name, res: parseQuestionFile(f.name, await f.text()) })));
    const merged = mergeResults(parsed);
    // Report images referenced by the file but not selected.
    for (const q of merged.questions) {
      if (q.imageRef && !q.imageRef.startsWith("data:") && !/^https?:/i.test(q.imageRef) && !imgs.has(q.imageRef.split("/").pop()!.toLowerCase())) {
        merged.issues.push({ file: "", item: 0, id: q.id, level: "warning", message: `image "${q.imageRef}" was not selected — select it together with the question file` });
      }
      if (q.imageRef && /^https?:/i.test(q.imageRef)) {
        merged.issues.push({ file: "", item: 0, id: q.id, level: "warning", message: `image is a web link and will not work offline` });
      }
    }
    setResult(merged);
    setTitle(parsed.find((p) => p.res.title)?.res.title ?? qFiles.map((f) => f.name.replace(/\.\w+$/, "")).join(" + "));
  };

  const loadSample = async () => {
    const res = await fetch("./sample-questions.json");
    const blob = await res.blob();
    await check([new File([blob], "sample-questions.json", { type: "application/json" })]);
  };

  const doImport = async () => {
    if (!result) return;
    setBusy("Importing…");
    try {
      const r = await importUpload(title || "Questions", files.map((f) => f.name), result.questions, images, setBusy);
      await updateSettings({ selectedTags: null });
      await refreshUpload();
      setDone(`Imported ${r.imported} questions.${r.missingImages.length ? ` ${r.missingImages.length} image(s) missing.` : ""}`);
      setResult(undefined);
    } catch (e) {
      setDone(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <main className="screen">
      <TopBar title="Upload questions" onBack={() => go("home")} />
      <section className="card">
        <p>
          Select today's question file(s) — JSON or CSV — plus any images they refer to. The upload <b>replaces</b> the current set; your wrong-answer marks and statistics are kept.
        </p>
        <p className="notice privacy">
          🔒 Never include identifiable patient data (names, dates of birth, case numbers). Questions stay on this device; only the text of a question is sent to the AI for answer checking and explanations.
        </p>
        {upload && <p className="muted">Current set: <b>{upload.title}</b> — {upload.count} questions, {upload.tags.length} topics, uploaded {new Date(upload.uploadedAt).toLocaleString()}.</p>}
        <div className="row">
          <button className="btn primary" onClick={() => ref.current?.click()}>Choose files</button>
          <button className="btn" onClick={loadSample}>Use the sample set (30)</button>
        </div>
        <input ref={ref} type="file" multiple accept=".json,.csv,.tsv,.txt,application/json,text/csv,image/*" hidden onChange={(e) => e.target.files && check(e.target.files)} />
        <p className="muted small">The file format is described in the README (docs/question-format.md).</p>
      </section>

      {result && (
        <section className="card">
          <h3>Check report</h3>
          <p>
            <b>{result.questions.length}</b> valid question{result.questions.length === 1 ? "" : "s"} in {files.length} file{files.length === 1 ? "" : "s"}
            {images.size ? `, ${images.size} image${images.size === 1 ? "" : "s"}` : ""}.
            {" "}<span className={errors.length ? "bad-text" : "good-text"}>{errors.length} error{errors.length === 1 ? "" : "s"}</span>, {warnings.length} warning{warnings.length === 1 ? "" : "s"}.
          </p>
          {result.issues.length > 0 && (
            <ul className="issues">
              {result.issues.slice(0, 200).map((i, n) => (
                <li key={n} className={i.level}>
                  <b>{i.level === "error" ? "Error" : "Warning"}</b> {i.file && `${i.file} `}{i.item ? `#${i.item}` : ""}{i.id ? ` (${i.id})` : ""}: {i.message}
                </li>
              ))}
              {result.issues.length > 200 && <li>…and {result.issues.length - 200} more</li>}
            </ul>
          )}
          {errors.length > 0 && <p className="muted small">Items with errors are skipped. Fix them in your file and upload again, or import the valid ones now.</p>}
          <label className="field">
            <span>Name of this set</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button className="btn primary wide" disabled={!result.questions.length || !!busy} onClick={doImport}>
            {busy || `Import ${result.questions.length} question${result.questions.length === 1 ? "" : "s"}`}
          </button>
        </section>
      )}

      {done && (
        <section className="card">
          <p>{done}</p>
          <button className="btn primary wide" onClick={() => go(run && run.phase !== "done" ? "play" : "newrun")}>
            {run && run.phase !== "done" ? "Continue adventure" : "Start an adventure"}
          </button>
        </section>
      )}
    </main>
  );
}
