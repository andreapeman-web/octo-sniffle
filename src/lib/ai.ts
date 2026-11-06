// AI calls: through Claude directly when running as a Claude artifact, otherwise
// through the serverless proxy. Every call has an offline fallback, so the game never blocks.
import { callClaude } from "./claudeAi";
import { db } from "./db";
import { IS_ARTIFACT_BUILD } from "./platform";
import { pushNarration } from "./sync";
import { currentStop, lineup } from "./engine";
import type { Adventure, NarrationBundle, Question, Run, Settings } from "./types";

async function post<T>(s: Settings, path: string, body: unknown, timeoutMs = 45_000): Promise<T> {
  if (IS_ARTIFACT_BUILD) return callClaude<T>(path, body);
  if (!s.proxyUrl) throw new Error("AI proxy not configured");
  if (!navigator.onLine) throw new Error("offline");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(s.proxyUrl.replace(/\/+$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": s.proxyToken },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI proxy error ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function testProxy(s: Settings): Promise<string> {
  const res = await fetch(s.proxyUrl.replace(/\/+$/, "") + "/health", { headers: { "X-App-Token": s.proxyToken } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { model: string };
  return j.model;
}

export const aiEnabled = (s: Settings) => (IS_ARTIFACT_BUILD ? s.useClaude !== false : Boolean(s.proxyUrl && s.proxyToken));

// ---------- Narration ----------

interface NarrateOut {
  narration: string;
  intros: { monsterId: string; line: string }[];
  hitLines: string[];
  missLines: string[];
}

function fallbackBundle(adv: Adventure, stopIndex: number): NarrationBundle {
  const stop = adv.stops[stopIndex];
  const intros: Record<string, string> = {};
  for (const g of stop.encounter.monsters) {
    const m = adv.monsters[g.monsterId];
    intros[g.monsterId] = m?.description ?? `${m?.name ?? "A foe"} blocks your way.`;
  }
  return { key: `${adv.id}:${stop.id}`, narration: stop.narration, intros, hitLines: adv.hitLines, missLines: adv.missLines, ai: false };
}

const inflight = new Map<string, Promise<NarrationBundle>>();

/**
 * Narration for a stop. Cached on the device after the first AI call, so replays
 * and offline sessions need no new calls. Falls back to the adventure's own text.
 */
export function getStopNarration(adv: Adventure, run: Run, stopIndex: number, s: Settings): Promise<NarrationBundle> {
  const stop = adv.stops[stopIndex];
  if (!stop) return Promise.resolve(fallbackBundle(adv, Math.max(0, adv.stops.length - 1)));
  const key = `${adv.id}:${stop.id}`;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    const d = await db();
    const cached = await d.get("narration", key);
    if (cached) return cached;
    const fb = fallbackBundle(adv, stopIndex);
    if (!aiEnabled(s)) return fb;
    try {
      const prev = adv.stops[stopIndex - 1];
      const out = await post<NarrateOut>(s, "/narrate", {
        kind: "stop",
        adventure: { title: adv.title, synopsis: adv.synopsis, styleGuide: adv.styleGuide },
        chapter: adv.chapters.find((c) => c.id === stop.chapterId)?.title,
        location: stop.location,
        description: stop.description,
        storyText: stop.narration,
        previous: prev ? `The hero defeated ${prev.encounter.name} at ${prev.location}.` : adv.intro,
        monsters: stop.encounter.monsters.map((g) => ({ id: g.monsterId, name: adv.monsters[g.monsterId].name, description: adv.monsters[g.monsterId].description })),
        character: { name: run.character.name, level: run.character.level },
      });
      const intros = { ...fb.intros };
      for (const i of out.intros ?? []) if (i.line) intros[i.monsterId] = i.line;
      const bundle: NarrationBundle = {
        key,
        narration: out.narration || fb.narration,
        intros,
        hitLines: out.hitLines?.length ? out.hitLines : fb.hitLines,
        missLines: out.missLines?.length ? out.missLines : fb.missLines,
        ai: true,
      };
      await d.put("narration", bundle);
      pushNarration(adv.id);
      return bundle;
    } catch {
      return fb;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Fire-and-forget: generate the next stop's narration while the player fights. */
export function prefetchNext(adv: Adventure, run: Run, s: Settings) {
  if (run.stopIndex + 1 < adv.stops.length) void getStopNarration(adv, run, run.stopIndex + 1, s);
}

export async function getRestNarration(adv: Adventure, run: Run, s: Settings): Promise<{ place: string; text: string }> {
  const stop = currentStop(run, adv) ?? adv.stops[adv.stops.length - 1];
  const place = adv.safePlaces.find((p) => p.id === stop.safePlaceId) ?? adv.safePlaces[0];
  const fallback = run.knockedOut
    ? `Darkness. When you open your eyes you are lying in ${place.name}. Someone found you and carried you here. ${place.description} Nothing is lost — but you must recover before you face the enemy again.`
    : `You make your way back to ${place.name}. ${place.description} Here you can rest and study until you are ready.`;
  if (!aiEnabled(s)) return { place: place.name, text: fallback };
  try {
    const out = await post<NarrateOut>(s, "/narrate", {
      kind: run.knockedOut ? "knockout" : "rest",
      adventure: { title: adv.title, synopsis: adv.synopsis },
      safePlace: place,
      previous: `The hero was at ${stop.location}, facing ${stop.encounter.name}.`,
      character: { name: run.character.name, level: run.character.level },
    }, 20_000);
    return { place: place.name, text: out.narration || fallback };
  } catch {
    return { place: place.name, text: fallback };
  }
}

export async function getEndingNarration(adv: Adventure, run: Run, s: Settings): Promise<string> {
  const key = `${adv.id}:__ending`;
  const d = await db();
  const cached = await d.get("narration", key);
  if (cached) return cached.narration;
  if (!aiEnabled(s)) return adv.ending;
  try {
    const out = await post<NarrateOut>(s, "/narrate", {
      kind: "ending",
      adventure: { title: adv.title, synopsis: adv.synopsis },
      storyText: adv.ending,
      character: { name: run.character.name, level: run.character.level },
    });
    await d.put("narration", { key, narration: out.narration, intros: {}, hitLines: [], missLines: [], ai: true });
    pushNarration(adv.id);
    return out.narration;
  } catch {
    return adv.ending;
  }
}

export function encounterMonsters(adv: Adventure, run: Run) {
  const stop = currentStop(run, adv);
  return stop ? lineup(stop, adv) : [];
}

// ---------- Answer grading & explanations ----------

export type GradeResult = { satisfactory: boolean; feedback: string; source: "ai" } | { source: "offline"; exact: boolean };

export async function gradeTyped(s: Settings, q: Question, answer: string, exact: boolean): Promise<GradeResult> {
  if (exact || !aiEnabled(s)) return { source: "offline", exact };
  try {
    const out = await post<{ satisfactory: boolean; feedback: string }>(s, "/grade", {
      question: q.question,
      reference: q.answerText,
      answer,
    }, 30_000);
    return { ...out, source: "ai" };
  } catch {
    return { source: "offline", exact };
  }
}

export type ExplainResult = { kind: "ai"; text: string } | { kind: "cannot" } | { kind: "unavailable" };

const explainCache = new Map<string, ExplainResult>();

export async function explainFromAI(s: Settings, q: Question): Promise<ExplainResult> {
  if (explainCache.has(q.key)) return explainCache.get(q.key)!;
  if (!aiEnabled(s)) return { kind: "unavailable" };
  try {
    const out = await post<{ confident: boolean; explanation: string }>(s, "/explain", {
      question: q.question,
      options: q.options,
      reference: q.answerText,
    }, 60_000);
    const r: ExplainResult = out.confident && out.explanation ? { kind: "ai", text: out.explanation } : { kind: "cannot" };
    explainCache.set(q.key, r);
    return r;
  } catch {
    return { kind: "unavailable" };
  }
}
