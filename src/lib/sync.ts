// Account sync for the artifact version. The game always works on its local
// IndexedDB copy (fast, offline-tolerant); when the artifact's `db` capability is
// available, progress is mirrored to the viewer's private area of the artifact
// store (data/users/<id>/...), so it follows them to other devices.
//
// What syncs: runs, settings, streak, topic stats, per-question stats, wrong-answer
// marks, narration cache, imported adventures, portraits and adventure art.
// What stays on the device: the current question upload and its images (they are
// uploaded again each session, as the brief asks).
//
// Remote is authoritative at load. Afterwards every change is written back,
// coalesced per document (one write in flight per document).
import { db, kvGet } from "./db";
import { dataUriToBlob } from "./images";
import { capability, getUserId } from "./platform";
import type { Mark, QuestionStat } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, unknown>;

const SHARDS = 32;
const MAX_DOC = 240_000; // stay under the 256 KiB document cap

let base: any = null; // CollectionReference for data/users/<id>
let status: "local" | "connecting" | "synced" | "error" = "local";
const listeners = new Set<(s: typeof status) => void>();

export function syncStatus() {
  return status;
}
export function onSyncStatus(fn: (s: typeof status) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function setStatus(s: typeof status) {
  status = s;
  listeners.forEach((f) => f(s));
}

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 150);
function shardOf(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h % SHARDS;
}

// In-memory shard maps, so a shard document can be rebuilt without scanning IndexedDB.
type CompactStat = [number, number, number, number, number, number]; // seen, correct, wrong, lastSeen, box, due
const qsShards: Record<string, CompactStat>[] = Array.from({ length: SHARDS }, () => ({}));
const markShards: Record<string, Mark>[] = Array.from({ length: SHARDS }, () => ({}));

// ---------- write queue ----------

const producers = new Map<string, () => Promise<Doc | null>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();
const dirty = new Set<string>();

function schedule(docId: string, produce: () => Promise<Doc | null>, delay = 600) {
  if (!base) return;
  producers.set(docId, produce);
  dirty.add(docId);
  clearTimeout(timers.get(docId));
  timers.set(docId, setTimeout(() => void flush(docId), delay));
}

async function flush(docId: string) {
  if (inflight.has(docId)) return; // the running write re-checks `dirty` when done
  if (!dirty.has(docId)) return;
  dirty.delete(docId);
  const produce = producers.get(docId)!;
  const p = (async () => {
    try {
      const body = await produce();
      const ref = base.doc(docId);
      if (body === null) await ref.delete();
      else if (JSON.stringify(body).length > MAX_DOC) console.warn(`sync: ${docId} too large, kept on this device only`);
      else await ref.set({ ...body, _at: Date.now() });
      if (status !== "synced") setStatus("synced");
    } catch (e) {
      console.warn("sync write failed", docId, e);
      setStatus("error");
    }
  })();
  inflight.set(docId, p);
  await p;
  inflight.delete(docId);
  if (dirty.has(docId)) void flush(docId);
}

/** Write everything pending now (e.g. before the page is hidden). */
export function flushAll() {
  for (const id of [...dirty]) {
    clearTimeout(timers.get(id));
    void flush(id);
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushAll());
}

// ---------- producers ----------

const kvDoc = (key: string) => async () => {
  const v = await kvGet(key);
  return v === undefined ? null : ({ v } as Doc);
};

export function pushKv(key: "settings" | "streak" | "lastExport") {
  schedule(`kv~${key}`, kvDoc(key));
}

export function pushRun(adventureId: string) {
  schedule(`run~${safeId(adventureId)}`, async () => {
    const r = await (await db()).get("runs", adventureId);
    return r ? ({ run: r } as Doc) : null;
  }, 300);
}

export function pushAdventure(adventureId: string) {
  schedule(`adv~${safeId(adventureId)}`, async () => {
    const a = await (await db()).get("adventures", adventureId);
    return a ? ({ adventure: a } as Doc) : null;
  });
}

export function pushNarration(adventureId: string) {
  schedule(`narr~${safeId(adventureId)}`, async () => {
    const d = await db();
    const keys = (await d.getAllKeys("narration")).filter((k) => String(k).startsWith(adventureId + ":"));
    const items = await Promise.all(keys.map((k) => d.get("narration", k)));
    return items.length ? ({ items } as Doc) : null;
  });
}

export function pushTopics() {
  schedule("topics", async () => ({ topics: await (await db()).getAll("topics") }));
}

export function pushQuestionStat(st: QuestionStat) {
  const n = shardOf(st.key);
  qsShards[n][st.key] = [st.seen, st.correct, st.wrong, st.lastSeen, st.box, st.due];
  schedule(`qs~${n}`, async () => ({ s: qsShards[n] }));
}

export function pushMark(key: string, mark: Mark | null) {
  const n = shardOf(key);
  if (mark) {
    // Snapshot without the device-local image reference.
    const { imageId: _i, ...snap } = mark.snapshot;
    void _i;
    markShards[n][key] = { ...mark, snapshot: snap };
  } else delete markShards[n][key];
  schedule(`marks~${n}`, async () => (Object.keys(markShards[n]).length ? { m: markShards[n] } : null));
}

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Portraits and adventure art (question images stay on the device). */
export function pushImage(id: string) {
  schedule(`img~${safeId(id)}`, async () => {
    const rec = await (await db()).get("images", id);
    if (!rec || rec.kind === "question") return null;
    return { id, kind: rec.kind, width: rec.width, height: rec.height, url: await blobToDataUrl(rec.blob) };
  }, 200);
}

export function deleteRemote(docId: string) {
  schedule(docId, async () => null, 0);
}

export function deleteRunRemote(adventureId: string) {
  deleteRemote(`run~${safeId(adventureId)}`);
  deleteRemote(`narr~${safeId(adventureId)}`);
}

// ---------- startup ----------

const SYNCED_KV = ["settings", "streak", "lastExport"];

/**
 * Connect to the account store. Remote data replaces the synced part of the local
 * copy; on the first visit (nothing remote yet) the local copy is uploaded.
 * Resolves true when the local copy changed (the app should reload its state).
 */
export async function startSync(): Promise<boolean> {
  const dbCap = await capability("db");
  const uid = dbCap ? await getUserId() : null;
  if (!dbCap || !uid) {
    setStatus("local");
    return false;
  }
  setStatus("connecting");
  try {
    const col = dbCap.collection(`data/users/${uid}`);
    const snap = await col.get();
    base = col;
    const remote = new Map<string, Doc>(snap.docs.map((d: any) => [d.id, d.data() as Doc]));
    const d = await db();

    if (remote.size === 0) {
      await uploadAll();
      setStatus("synced");
      return false;
    }

    // Remote wins: replace the synced stores locally.
    const tx = d.transaction(["runs", "adventures", "narration", "topics", "qstats", "marks", "images", "kv", "questions"], "readwrite");
    for (const s of ["runs", "narration", "topics", "qstats", "marks"] as const) await tx.objectStore(s).clear();
    const imgs = tx.objectStore("images");
    for (const k of await imgs.getAllKeys()) {
      const rec = await imgs.get(k);
      if (rec && rec.kind !== "question") await imgs.delete(k);
    }
    for (const k of SYNCED_KV) await tx.objectStore("kv").delete(k);

    for (const [id, body] of remote) {
      if (id.startsWith("run~")) await tx.objectStore("runs").put(body.run as never);
      else if (id.startsWith("adv~")) await tx.objectStore("adventures").put(body.adventure as never);
      else if (id.startsWith("narr~")) for (const it of (body.items as unknown[]) ?? []) await tx.objectStore("narration").put(it as never);
      else if (id === "topics") for (const t of (body.topics as unknown[]) ?? []) await tx.objectStore("topics").put(t as never);
      else if (id.startsWith("kv~")) await tx.objectStore("kv").put(body.v as never, id.slice(3));
      else if (id.startsWith("qs~")) {
        const n = Number(id.slice(3));
        const s = (body.s ?? {}) as Record<string, CompactStat>;
        if (qsShards[n]) qsShards[n] = { ...s };
        for (const [key, [seen, correct, wrong, lastSeen, box, due]] of Object.entries(s)) {
          await tx.objectStore("qstats").put({ key, seen, correct, wrong, lastSeen, box, due });
        }
      } else if (id.startsWith("marks~")) {
        const n = Number(id.slice(6));
        const m = (body.m ?? {}) as Record<string, Mark>;
        if (markShards[n]) markShards[n] = { ...m };
        for (const mark of Object.values(m)) {
          // Re-attach the local image when this question is in the current upload.
          const q = await tx.objectStore("questions").get(mark.key);
          await tx.objectStore("marks").put({ ...mark, snapshot: { ...mark.snapshot, imageId: q?.imageId } });
        }
      } else if (id.startsWith("img~") && typeof body.url === "string") {
        const blob = dataUriToBlob(body.url as string);
        await imgs.put({ id: body.id as string, blob, kind: body.kind as "portrait" | "asset", width: Number(body.width) || 0, height: Number(body.height) || 0, bytes: blob.size, createdAt: Date.now() });
      }
    }
    await tx.done;
    setStatus("synced");
    return true;
  } catch (e) {
    console.warn("sync unavailable", e);
    base = null;
    setStatus("error");
    return false;
  }
}

/** Upload every synced record (first visit, or after restoring a backup). */
export async function uploadAll() {
  if (!base) return;
  const d = await db();
  for (const r of await d.getAll("runs")) pushRun(r.adventureId);
  for (const a of await d.getAll("adventures")) if (a.id !== "lantern-of-saint-quell") pushAdventure(a.id);
  const advIds = new Set((await d.getAllKeys("narration")).map((k) => String(k).split(":")[0]));
  for (const id of advIds) pushNarration(id);
  pushTopics();
  for (const k of SYNCED_KV) pushKv(k as "settings");
  for (const s of await d.getAll("qstats")) pushQuestionStat(s);
  for (const m of await d.getAll("marks")) pushMark(m.key, m);
  for (const i of await d.getAll("images")) if (i.kind !== "question") pushImage(i.id);
}

/** Delete every synced document (used by "Delete all data"). */
export async function wipeRemote() {
  if (!base) return;
  const snap = await base.get();
  for (const doc of snap.docs) {
    producers.delete(doc.id);
    dirty.delete(doc.id);
    await base.doc(doc.id).delete();
  }
  for (const s of qsShards) for (const k of Object.keys(s)) delete s[k];
  for (const s of markShards) for (const k of Object.keys(s)) delete s[k];
}
