import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Adventure,
  Mark,
  NarrationBundle,
  Question,
  QuestionStat,
  Run,
  TopicStat,
} from "./types";

export interface StoredImage {
  id: string;
  blob: Blob;
  kind: "question" | "portrait" | "asset";
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}

interface RpgDB extends DBSchema {
  questions: { key: string; value: Question; indexes: { "by-tag": string } };
  marks: { key: string; value: Mark };
  qstats: { key: string; value: QuestionStat; indexes: { "by-due": number } };
  topics: { key: string; value: TopicStat };
  images: { key: string; value: StoredImage; indexes: { "by-kind": string } };
  runs: { key: string; value: Run };
  adventures: { key: string; value: Adventure };
  narration: { key: string; value: NarrationBundle };
  kv: { key: string; value: unknown };
}

export type StoreName = "questions" | "marks" | "qstats" | "topics" | "images" | "runs" | "adventures" | "narration" | "kv";
export const ALL_STORES: StoreName[] = ["questions", "marks", "qstats", "topics", "images", "runs", "adventures", "narration", "kv"];

let dbPromise: Promise<IDBPDatabase<RpgDB>> | null = null;

export function db(): Promise<IDBPDatabase<RpgDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RpgDB>("study-rpg", 1, {
      upgrade(d) {
        const q = d.createObjectStore("questions", { keyPath: "key" });
        q.createIndex("by-tag", "tags", { multiEntry: true });
        d.createObjectStore("marks", { keyPath: "key" });
        const s = d.createObjectStore("qstats", { keyPath: "key" });
        s.createIndex("by-due", "due");
        d.createObjectStore("topics", { keyPath: "tag" });
        const im = d.createObjectStore("images", { keyPath: "id" });
        im.createIndex("by-kind", "kind");
        d.createObjectStore("runs", { keyPath: "adventureId" });
        d.createObjectStore("adventures", { keyPath: "id" });
        d.createObjectStore("narration", { keyPath: "key" });
        d.createObjectStore("kv");
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("kv", key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put("kv", value, key);
}

/** Write many records in chunks so a 20k-question upload never blocks the UI for long. */
export async function putMany<S extends "questions" | "images">(
  store: S,
  values: RpgDB[S]["value"][],
  onProgress?: (done: number) => void,
): Promise<void> {
  const d = await db();
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const tx = d.transaction(store, "readwrite");
    for (const v of values.slice(i, i + CHUNK)) tx.store.put(v as never);
    await tx.done;
    onProgress?.(Math.min(values.length, i + CHUNK));
  }
}
