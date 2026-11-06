import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { TopicPicker } from "../components/Panels";
import { TopBar, downloadBlob } from "../components/ui";
import { testProxy } from "../lib/ai";
import { exportBackup, fmtBytes, importBackup, requestPersistence, storageReport, type StorageReport } from "../lib/backup";
import { ALL_STORES, db } from "../lib/db";
import { deleteRun } from "../lib/store";

export function SettingsScreen() {
  const { settings, updateSettings, go, run, adventure, reloadAll } = useApp();
  const [url, setUrl] = useState(settings.proxyUrl);
  const [token, setToken] = useState(settings.proxyToken);
  const [proxyMsg, setProxyMsg] = useState("");
  const [report, setReport] = useState<StorageReport>();
  const [msg, setMsg] = useState("");
  const [topics, setTopics] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshReport = () => void storageReport().then(setReport);
  useEffect(refreshReport, []);

  const saveProxy = async () => {
    await updateSettings({ proxyUrl: url.trim(), proxyToken: token.trim() });
    if (!url.trim()) return setProxyMsg("AI disabled — the game uses the adventure's own text.");
    setProxyMsg("Testing…");
    try {
      const model = await testProxy({ ...settings, proxyUrl: url.trim(), proxyToken: token.trim() });
      setProxyMsg(`Connected ✓ (model: ${model})`);
    } catch (e) {
      setProxyMsg(`Could not reach the proxy: ${(e as Error).message}`);
    }
  };

  const doExport = async () => {
    setMsg("Preparing backup…");
    const blob = await exportBackup();
    const d = new Date();
    downloadBlob(blob, `study-rpg-backup-${d.toISOString().slice(0, 10)}.json`);
    await updateSettings({ lastExport: Date.now() });
    setMsg(`Backup saved (${fmtBytes(blob.size)}). Keep it in iCloud Drive / OneDrive to move to another device.`);
  };

  const doImport = async (f: File) => {
    if (!confirm("Restoring replaces ALL data on this device with the backup. Continue?")) return;
    try {
      await importBackup(f);
      await reloadAll();
      setMsg("Backup restored ✓");
      refreshReport();
    } catch (e) {
      setMsg(`Restore failed: ${(e as Error).message}`);
    }
  };

  const resetRun = async () => {
    if (!run || !adventure) return;
    if (!confirm(`Reset your progress in "${adventure.title}"? Study marks and statistics are kept.`)) return;
    await deleteRun(adventure.id);
    await reloadAll();
    setMsg("Adventure progress reset.");
  };

  const resetAll = async () => {
    if (!confirm("Delete EVERYTHING on this device (progress, marks, statistics, questions, images)? Export a backup first if unsure.")) return;
    const d = await db();
    const tx = d.transaction(ALL_STORES, "readwrite");
    for (const s of ALL_STORES) await tx.objectStore(s).clear();
    await tx.done;
    await reloadAll();
    setMsg("All data deleted.");
    refreshReport();
  };

  const pct = Math.round(settings.difficulty * 100);

  return (
    <main className="screen">
      <TopBar title="Settings" onBack={() => go("home")} />

      <section className="card">
        <h3>Game</h3>
        <label className="field">
          <span>Monster damage: {pct}%</span>
          <input type="range" min={25} max={100} step={5} value={pct} onChange={(e) => updateSettings({ difficulty: +e.target.value / 100 })} />
          <small className="muted">Adventures are written for a party of four. Lower this if fighting alone feels too harsh.</small>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Sound effects
        </label>
        <button className="btn" onClick={() => setTopics(true)}>Choose topics ({settings.selectedTags ? settings.selectedTags.length : "all"})</button>
      </section>

      <section className="card">
        <h3>Backup & devices</h3>
        <p className="muted small">One file restores everything: progress, marks, statistics, current questions and images. Use it to move between iPhone, iPad and Windows.</p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore backup</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        {settings.lastExport && <p className="muted small">Last backup: {new Date(settings.lastExport).toLocaleString()}</p>}
        {msg && <p className="notice">{msg}</p>}
      </section>

      <section className="card">
        <h3>Storage</h3>
        {report && (
          <>
            <p>
              Using <b>{fmtBytes(report.usage)}</b>{report.quota ? ` of ${fmtBytes(report.quota)} available` : ""}.{" "}
              {report.persisted === true ? <span className="good-text">Protected from automatic deletion.</span> : <span className="bad-text">Not protected: the browser may delete data when space is low.</span>}
            </p>
            {report.persisted !== true && (
              <button className="btn small" onClick={async () => { await requestPersistence(); refreshReport(); }}>
                Ask the browser to keep my data
              </button>
            )}
            <table className="stats-table">
              <tbody>
                {report.parts.map((p) => (
                  <tr key={p.label}><td>{p.label}</td><td>{p.count}</td><td>{fmtBytes(p.bytes)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">On iPhone/iPad, install the app to the Home Screen: installed apps get more storage and are less likely to be cleared.</p>
          </>
        )}
      </section>

      <section className="card">
        <h3>AI Dungeon Master</h3>
        <p className="muted small">Narration, typed-answer checking and explanations go through your own proxy, so the API key never sits on this device. Without it, the game uses the adventure's own text and you mark typed answers yourself.</p>
        <label className="field"><span>Proxy URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://study-rpg-proxy.<you>.workers.dev" inputMode="url" autoCapitalize="off" /></label>
        <label className="field"><span>App token</span><input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoCapitalize="off" /></label>
        <button className="btn" onClick={saveProxy}>Save & test</button>
        {proxyMsg && <p className="muted">{proxyMsg}</p>}
      </section>

      <section className="card danger">
        <h3>Reset</h3>
        <div className="row">
          <button className="btn" disabled={!run} onClick={resetRun}>Reset adventure progress</button>
          <button className="btn bad" onClick={resetAll}>Delete all data</button>
        </div>
      </section>

      {topics && <TopicPicker onClose={() => setTopics(false)} />}
    </main>
  );
}
