import { db, kvGet, kvSet, putMany } from "./db";
import { dataUriToBlob, storeImage } from "./images";
import type { ParsedQuestion } from "./parse";
import { pushKv, pushMark, pushQuestionStat, pushTopics } from "./sync";
import type { Mark, Question, QuestionStat, UploadInfo } from "./types";

/** Leitner intervals by box (days). */
const BOX_DAYS = [0, 0, 1, 3, 7, 21];
const DAY = 86_400_000;

export async function getUploadInfo(): Promise<UploadInfo | undefined> {
  return kvGet<UploadInfo>("upload");
}

/**
 * Replace the current question set with a new upload.
 * Marks, per-question stats and topic stats are kept (they are keyed by question key).
 */
export async function importUpload(
  title: string,
  files: string[],
  questions: ParsedQuestion[],
  imageFiles: Map<string, File>,
  onProgress?: (msg: string) => void,
): Promise<{ imported: number; missingImages: string[] }> {
  const d = await db();
  const missingImages: string[] = [];
  // Old question images are replaced together with the questions.
  const oldImgKeys = await d.getAllKeysFromIndex("images", "by-kind", "question");
  {
    const tx = d.transaction(["questions", "images"], "readwrite");
    await tx.objectStore("questions").clear();
    for (const k of oldImgKeys) tx.objectStore("images").delete(k);
    await tx.done;
  }

  const final: Question[] = [];
  let n = 0;
  for (const q of questions) {
    const { imageRef, ...rest } = q;
    const out: Question = { ...rest };
    if (imageRef) {
      try {
        if (imageRef.startsWith("data:")) {
          const id = `q:${q.key}`;
          await storeImage(id, dataUriToBlob(imageRef), "question");
          out.imageId = id;
        } else if (/^https?:\/\//i.test(imageRef)) {
          out.imageUrl = imageRef;
        } else {
          const f = imageFiles.get(imageRef.split("/").pop()!.toLowerCase());
          if (f) {
            const id = `q:${q.key}`;
            await storeImage(id, f, "question");
            out.imageId = id;
          } else missingImages.push(imageRef);
        }
      } catch {
        missingImages.push(imageRef);
      }
    }
    final.push(out);
    if (++n % 200 === 0) onProgress?.(`Preparing ${n}/${questions.length}…`);
  }
  await putMany("questions", final, (done) => onProgress?.(`Saving ${done}/${final.length}…`));

  // Refresh mark snapshots for questions present again in this upload.
  const marks = await d.getAll("marks");
  const byKey = new Map(final.map((q) => [q.key, q]));
  const tx = d.transaction("marks", "readwrite");
  for (const m of marks) {
    const q = byKey.get(m.key);
    if (q) tx.store.put({ ...m, snapshot: q });
  }
  await tx.done;

  const tags = [...new Set(final.flatMap((q) => q.tags))].sort();
  await kvSet("upload", { title, files, count: final.length, tags, uploadedAt: Date.now() } satisfies UploadInfo);
  pool = null;
  return { imported: final.length, missingImages };
}

// ---------- Pool of question keys for the current upload + selected topics ----------

let pool: { keys: string[]; set: Set<string>; tagsKey: string } | null = null;
const recent: string[] = [];

export function invalidatePool() {
  pool = null;
}

export async function getPool(selectedTags: string[] | null): Promise<{ keys: string[]; set: Set<string> }> {
  const tagsKey = selectedTags ? [...selectedTags].sort().join("|") : "*";
  if (pool && pool.tagsKey === tagsKey) return pool;
  const d = await db();
  let keys: string[];
  if (!selectedTags) keys = (await d.getAllKeys("questions")) as string[];
  else {
    const s = new Set<string>();
    for (const t of selectedTags) for (const k of await d.getAllKeysFromIndex("questions", "by-tag", t)) s.add(k as string);
    keys = [...s];
  }
  pool = { keys, set: new Set(keys), tagsKey };
  return pool;
}

function pickRandom<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

function remember(key: string, poolSize: number) {
  recent.push(key);
  const max = Math.min(30, Math.max(0, Math.floor(poolSize / 2)));
  while (recent.length > max) recent.shift();
}

/**
 * Next question for a real fight. Mix: marked questions (re-asked), due reviews
 * (spaced repetition), then fresh questions. Loads only the one question it needs.
 */
export async function nextFightQuestion(selectedTags: string[] | null): Promise<Question | undefined> {
  const d = await db();
  const p = await getPool(selectedTags);
  if (p.keys.length === 0) return undefined;
  const notRecent = (k: string) => !recent.includes(k);
  const r = Math.random();
  let key: string | undefined;

  if (r < 0.25) {
    const marked = ((await d.getAllKeys("marks")) as string[]).filter((k) => p.set.has(k) && notRecent(k));
    key = pickRandom(marked);
  }
  if (!key && r < 0.6) {
    const due: string[] = [];
    let cur = await d.transaction("qstats").store.index("by-due").openCursor(IDBKeyRange.upperBound(Date.now()));
    while (cur && due.length < 40) {
      if (p.set.has(cur.value.key) && notRecent(cur.value.key)) due.push(cur.value.key);
      cur = await cur.continue();
    }
    key = pickRandom(due);
  }
  if (!key) {
    for (let i = 0; i < 12 && !key; i++) {
      const k = pickRandom(p.keys)!;
      if (notRecent(k)) key = k;
    }
    key ??= pickRandom(p.keys);
  }
  const q = key ? await d.get("questions", key) : undefined;
  if (q) remember(q.key, p.keys.length);
  return q;
}

/** Mock combat: only marked questions; random questions from the pool when none are marked. */
export async function nextMockQuestion(selectedTags: string[] | null): Promise<{ q: Question; marked: boolean } | undefined> {
  const d = await db();
  const marks = await d.getAll("marks");
  if (marks.length) {
    const fresh = marks.filter((m) => !recent.includes(m.key));
    const m = pickRandom(fresh.length ? fresh : marks)!;
    const q = (await d.get("questions", m.key)) ?? m.snapshot;
    remember(q.key, marks.length);
    return { q, marked: true };
  }
  const q = await nextFightQuestion(selectedTags);
  return q ? { q, marked: false } : undefined;
}

/** Record an answer: stats, spaced-repetition box, topic stats and wrong-answer mark. Saves immediately. */
export async function recordAnswer(q: Question, correct: boolean, mode: "fight" | "mock"): Promise<void> {
  const d = await db();
  const tx = d.transaction(["qstats", "topics", "marks"], "readwrite");
  const now = Date.now();
  const st: QuestionStat = (await tx.objectStore("qstats").get(q.key)) ?? { key: q.key, seen: 0, correct: 0, wrong: 0, lastSeen: 0, box: 1, due: 0 };
  st.seen++;
  st.lastSeen = now;
  if (correct) {
    st.correct++;
    st.box = Math.min(5, st.box + 1);
  } else {
    st.wrong++;
    st.box = 1;
  }
  st.due = now + BOX_DAYS[st.box] * DAY + (st.box === 1 ? 10 * 60_000 : 0);
  await tx.objectStore("qstats").put(st);

  for (const tag of q.tags) {
    const t = (await tx.objectStore("topics").get(tag)) ?? { tag, answered: 0, correct: 0 };
    t.answered++;
    if (correct) t.correct++;
    await tx.objectStore("topics").put(t);
  }

  const marks = tx.objectStore("marks");
  let markChange: Mark | null | undefined;
  if (!correct) {
    const m: Mark = (await marks.get(q.key)) ?? { key: q.key, markedAt: now, wrongCount: 0, snapshot: q };
    m.wrongCount++;
    m.markedAt = now;
    m.snapshot = q;
    await marks.put(m);
    markChange = m;
  } else if (mode === "mock" && (await marks.get(q.key))) {
    // A mark clears only after a correct answer in a mock combat.
    await marks.delete(q.key);
    markChange = null;
  }
  await tx.done;
  pushQuestionStat(st);
  pushTopics();
  if (markChange !== undefined) pushMark(q.key, markChange);
  await touchStreak();
}

export async function getMarks(): Promise<Mark[]> {
  const all = await (await db()).getAll("marks");
  return all.sort((a, b) => b.markedAt - a.markedAt);
}

export async function markCount(): Promise<number> {
  return (await db()).count("marks");
}

// ---------- Study streak ----------

export interface Streak {
  lastDay: string;
  count: number;
  best: number;
  days: number;
}

const dayStr = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function getStreak(): Promise<Streak> {
  const s = (await kvGet<Streak>("streak")) ?? { lastDay: "", count: 0, best: 0, days: 0 };
  const today = dayStr(Date.now());
  const yesterday = dayStr(Date.now() - DAY);
  if (s.lastDay !== today && s.lastDay !== yesterday) return { ...s, count: 0 };
  return s;
}

async function touchStreak() {
  const today = dayStr(Date.now());
  const s = (await kvGet<Streak>("streak")) ?? { lastDay: "", count: 0, best: 0, days: 0 };
  if (s.lastDay === today) return;
  const yesterday = dayStr(Date.now() - DAY);
  s.count = s.lastDay === yesterday ? s.count + 1 : 1;
  s.best = Math.max(s.best, s.count);
  s.days++;
  s.lastDay = today;
  await kvSet("streak", s);
  pushKv("streak");
}
