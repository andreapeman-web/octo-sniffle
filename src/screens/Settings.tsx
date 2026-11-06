import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import { TopicPicker } from "../components/Panels";
import { ConfirmButton, TopBar, downloadBlob } from "../components/ui";
import { testProxy } from "../lib/ai";
import { exportBackup, fmtBytes, importBackup, requestPersistence, storageReport, type StorageReport } from "../lib/backup";
import { ALL_STORES, db } from "../lib/db";
import { deleteRun } from "../lib/store";
import { IS_ARTIFACT_BUILD, saveFile } from "../lib/platform";
import { onSyncStatus, syncStatus, wipeRemote } from "../lib/sync";

export function SettingsScreen() {
  const { settings, updateSettings, go, run, adventure, reloadAll } = useApp();
  const [url, setUrl] = useState(settings.proxyUrl);
  const [token, setToken] = useState(settings.proxyToken);
  const [proxyMsg, setProxyMsg] = useState("");
  const [report, setReport] = useState<StorageReport>();
  const [msg, setMsg] = useState("");
  const [topics, setTopics] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const [sync, setSync] = useState(syncStatus());
  useEffect(() => onSyncStatus(setSync), []);

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
    const name = `study-rpg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (IS_ARTIFACT_BUILD) {
      const r = await saveFile(name, blob);
      if (r !== "saved") return setMsg(r === "declined" ? "Backup not saved." : "This view can't save files. Open the artifact on claude.ai to export.");
    } else downloadBlob(blob, name);
    await updateSettings({ lastExport: Date.now() });
    setMsg(`Backup saved (${fmtBytes(blob.size)}). Keep it in iCloud Drive / OneDrive to move to another device.`);
  };

  const doImport = async (f: File) => {
    setPendingRestore(null);
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
    await deleteRun(adventure.id);
    await reloadAll();
    setMsg("Adventure progress reset.");
  };

  const resetAll = async () => {
    await wipeRemote();
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
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPendingRestore(f); }} />
        {pendingRestore && (
          <div className="notice">
            <span>Restore <b>{pendingRestore.name}</b>? It replaces all your progress{IS_ARTIFACT_BUILD ? " here and in your Claude account" : " on this device"}.</span>
            <div className="row">
              <button className="btn small bad" onClick={() => doImport(pendingRestore)}>Restore</button>
              <button className="btn small" onClick={() => setPendingRestore(null)}>Cancel</button>
            </div>
          </div>
        )}
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

      {IS_ARTIFACT_BUILD ? (
      <section className="card">
        <h3>Claude as Dungeon Master</h3>
        <p className="muted small">Claude writes the narration, checks typed answers and explains questions your file doesn't explain. It runs on your own Claude account and asks your permission the first time.</p>
        <label className="check">
          <input id="use-claude" type="checkbox" checked={settings.useClaude !== false} onChange={(e) => updateSettings({ useClaude: e.target.checked })} /> Use Claude
        </label>
        <p className="muted small">
          Progress sync: {sync === "synced" ? "saved to your Claude account (private to you)." : sync === "connecting" ? "connecting…" : sync === "error" ? "the account store can't be reached right now; progress is kept in this browser." : "only in this browser (sign in to claude.ai to sync)."}
        </p>
      </section>
      ) : (
      <section className="card">
        <h3>AI Dungeon Master</h3>
        <p className="muted small">Narration, typed-answer checking and explanations go through your own proxy, so the API key never sits on this device. Without it, the game uses the adventure's own text and you mark typed answers yourself.</p>
        <label className="field"><span>Proxy URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://study-rpg-proxy.<you>.workers.dev" inputMode="url" autoCapitalize="off" /></label>
        <label className="field"><span>App token</span><input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoCapitalize="off" /></label>
        <button className="btn" onClick={saveProxy}>Save & test</button>
        {proxyMsg && <p className="muted">{proxyMsg}</p>}
      </section>
      )}

      <section className="card danger">
        <h3>Reset</h3>
        <div className="row">
          <ConfirmButton className="btn" disabled={!run} onConfirm={resetRun} confirmLabel="Tap again: reset adventure">Reset adventure progress</ConfirmButton>
          <ConfirmButton className="btn bad" onConfirm={resetAll} confirmLabel="Tap again: delete everything">Delete all data</ConfirmButton>
        </div>
      </section>

      {topics && <TopicPicker onClose={() => setTopics(false)} />}
    </main>
  );
}
