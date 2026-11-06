// Single-file backup of everything on the device (progress, marks, stats, questions, images, adventures).
import { ALL_STORES, db, kvGet, kvSet, type StoreName } from "./db";
import { forgetImageUrl } from "./images";
import { invalidatePool } from "./questions";
import { pushKv, uploadAll } from "./sync";

const FORMAT = "study-rpg-backup";

async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function exportBackup(): Promise<Blob> {
  const d = await db();
  const parts: BlobPart[] = [`{"format":"${FORMAT}","version":1,"exportedAt":${Date.now()},"stores":{`];
  let firstStore = true;
  for (const name of ALL_STORES) {
    parts.push(`${firstStore ? "" : ","}"${name}":[`);
    firstStore = false;
    let first = true;
    if (name === "kv") {
      const keys = await d.getAllKeys("kv");
      for (const k of keys) {
        parts.push((first ? "" : ",") + JSON.stringify({ k, v: await d.get("kv", k) }));
        first = false;
      }
    } else {
      let cur = await d.transaction(name).store.openCursor();
      const rows: unknown[] = [];
      while (cur) {
        rows.push(cur.value);
        cur = await cur.continue();
      }
      for (const v of rows) {
        let rec = v as Record<string, unknown>;
        if (name === "images") {
          const b = rec.blob as Blob;
          rec = { ...rec, blob: undefined, b64: await blobToB64(b), type: b.type };
        }
        parts.push((first ? "" : ",") + JSON.stringify(rec));
        first = false;
      }
    }
    parts.push("]");
  }
  parts.push("}}");
  await kvSet("lastExport", Date.now());
  pushKv("lastExport");
  const s = await kvGet<Record<string, unknown>>("settings");
  if (s) await kvSet("settings", { ...s, lastExport: Date.now() });
  return new Blob(parts, { type: "application/json" });
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text()) as { format: string; stores: Record<string, unknown[]> };
  if (data.format !== FORMAT) throw new Error("This is not a Study RPG backup file.");
  const d = await db();
  const tx = d.transaction(ALL_STORES, "readwrite");
  for (const name of ALL_STORES) {
    const st = tx.objectStore(name as StoreName);
    await st.clear();
    for (const row of data.stores[name] ?? []) {
      if (name === "kv") {
        const { k, v } = row as { k: string; v: unknown };
        await st.put(v as never, k as never);
      } else if (name === "images") {
        const r = row as Record<string, unknown>;
        const blob = b64ToBlob(r.b64 as string, (r.type as string) || "image/jpeg");
        const { b64: _b, type: _t, ...rest } = r;
        void _b;
        void _t;
        forgetImageUrl(rest.id as string);
        await st.put({ ...rest, blob } as never);
      } else await st.put(row as never);
    }
  }
  await tx.done;
  invalidatePool();
  await uploadAll();
}

export interface StorageReport {
  usage?: number;
  quota?: number;
  persisted?: boolean;
  parts: { label: string; bytes: number; count: number }[];
}

export async function requestPersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageReport(): Promise<StorageReport> {
  const d = await db();
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : undefined;
  const imgs = await d.getAll("images");
  const byKind = new Map<string, { bytes: number; count: number }>();
  for (const i of imgs) {
    const e = byKind.get(i.kind) ?? { bytes: 0, count: 0 };
    e.bytes += i.bytes;
    e.count++;
    byKind.set(i.kind, e);
  }
  // Estimate text stores by sampling.
  const sample = async (name: "questions" | "marks" | "narration" | "qstats") => {
    const count = await d.count(name);
    if (!count) return { bytes: 0, count };
    const some = await d.getAll(name, undefined, 50);
    const avg = some.reduce((a, x) => a + JSON.stringify(x).length * 2, 0) / some.length;
    return { bytes: Math.round(avg * count), count };
  };
  const labels: Record<string, string> = { question: "Question images", portrait: "Portraits", asset: "Adventure art" };
  const parts = [
    { label: "Questions (current upload)", ...(await sample("questions")) },
    { label: "Wrong-answer marks", ...(await sample("marks")) },
    { label: "Study statistics", ...(await sample("qstats")) },
    { label: "Cached narration", ...(await sample("narration")) },
    ...[...byKind.entries()].map(([k, v]) => ({ label: labels[k] ?? k, ...v })),
  ].sort((a, b) => b.bytes - a.bytes);
  return { usage: est.usage, quota: est.quota, persisted, parts };
}

export function fmtBytes(n?: number) {
  if (n === undefined) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
