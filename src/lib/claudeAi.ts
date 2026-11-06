// Artifact version of the AI calls: asks Claude directly through the artifact's
// `sample` capability (on the viewer's own Claude account), with the same rules
// as the serverless proxy in proxy/src/index.ts.
import { getSample } from "./platform";

let blocked = false; // viewer declined, or Claude unavailable in this view

export async function claudeAvailable(): Promise<boolean> {
  return !blocked && (await getSample()) !== null;
}

const DM_RULES = `You are the Dungeon Master of a single-player study game. The player answers medical exam questions; correct answers are hits, wrong answers are the monster's hits. Your job is only flavour text.
Rules:
- Stay grounded in the adventure facts given. Do not invent new major characters, places or plot twists.
- The route is fixed. Never offer the player choices or ask where to go.
- Write in second person ("you"), in English.
- No dice, rules or numbers in the prose. No gore beyond fantasy-adventure level.
- Never mention medicine, questions or the exam.`;

const GRADE_RULES = `You grade a typed answer to a medical exam question against the reference answer from the student's own question file.
- The reference answer is the standard. Judge whether the student's answer contains its essential point(s), allowing synonyms, abbreviations, other languages (English, German, Spanish) and minor spelling errors.
- Missing an essential element, adding a clinically wrong statement, or a wrong number/unit/dose makes it unsatisfactory.
- Do not add facts beyond what is needed to explain the verdict. Feedback: one or two short sentences in English.`;

const EXPLAIN_RULES = `You explain why an answer to a medical exam question is correct, for a doctor studying for certification. The question file has no explanation for this item.
- Only explain when you are confident the explanation is accurate and consistent with the reference answer from the question file.
- If you are not confident, or the reference answer looks doubtful or depends on a local guideline you cannot verify, set confident to false and leave explanation empty. Never guess and never invent drug doses, thresholds, numbers or citations.
- If confident: 2-5 sentences in English, plain text, exact units, no hedged filler.`;

interface NarrateReq {
  kind: "stop" | "rest" | "knockout" | "ending";
  adventure: { title: string; synopsis: string; styleGuide?: string };
  chapter?: string;
  location?: string;
  description?: string;
  storyText?: string;
  previous?: string;
  safePlace?: { name: string; description: string };
  monsters?: { id: string; name: string; description?: string }[];
  character: { name: string; level: number };
}

function narratePrompt(r: NarrateReq): string {
  const lines: (string | undefined)[] = [
    DM_RULES,
    "",
    `Adventure: ${r.adventure.title}`,
    `Synopsis: ${r.adventure.synopsis}`,
    r.chapter ? `Chapter: ${r.chapter}` : undefined,
    `Hero: ${r.character.name}, level ${r.character.level}.`,
    r.previous ? `What happened just before: ${r.previous}` : undefined,
  ];
  if (r.kind === "stop") {
    lines.push(
      `Next location: ${r.location} — ${r.description}`,
      `Module text for this stop (stay faithful to it): ${r.storyText}`,
      `Monsters waiting here: ${(r.monsters ?? []).map((m) => `${m.id} = ${m.name}${m.description ? ` (${m.description})` : ""}`).join("; ")}`,
      "",
      'Reply with only this JSON object: {"narration": string, "intros": [{"monsterId": string, "line": string}], "hitLines": [string], "missLines": [string]}',
      "narration: 3-6 sentences of the hero travelling to and arriving at this location, ending as the monsters appear.",
      "intros: one short line per monster id introducing it.",
      "hitLines: 6 varied one-line descriptions of the hero landing a blow on these monsters.",
      "missLines: 6 varied one-line descriptions of these monsters striking the hero.",
    );
  } else if (r.kind === "rest" || r.kind === "knockout") {
    lines.push(
      `Safe place: ${r.safePlace?.name} — ${r.safePlace?.description}`,
      r.kind === "knockout"
        ? "The hero was knocked unconscious in the last fight and wakes up here, rescued by locals. Write 3-5 sentences of waking and starting to recover through study and rest."
        : "Write 3-5 sentences of the hero briefly travelling back here to rest and recover.",
      'Reply with only this JSON object: {"narration": string}',
    );
  } else {
    lines.push(`Ending text from the module: ${r.storyText}`, "Write 4-6 sentences for the ending.", 'Reply with only this JSON object: {"narration": string}');
  }
  return lines.filter((l): l is string => l !== undefined).join("\n");
}

interface QA {
  question: string;
  options?: string[];
  reference: string;
  answer?: string;
}

function qaText(q: QA) {
  return [
    `Question: ${q.question}`,
    q.options?.length ? `Options:\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}` : "",
    `Reference answer (from the question file): ${q.reference}`,
    q.answer !== undefined ? `Student's answer: ${q.answer}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Same endpoints as the proxy: /narrate, /grade, /explain. */
export async function callClaude<T>(path: string, body: unknown): Promise<T> {
  const sample = blocked ? null : await getSample();
  if (!sample) throw new Error("Claude unavailable");
  let prompt: string;
  let modelTier: "quick" | "default" | "complex";
  if (path === "/narrate") {
    prompt = narratePrompt(body as NarrateReq);
    modelTier = "quick";
  } else if (path === "/grade") {
    prompt = `${GRADE_RULES}\n\n${qaText(body as QA)}\n\nReply with only this JSON object: {"satisfactory": boolean, "feedback": string}`;
    modelTier = "default";
  } else if (path === "/explain") {
    prompt = `${EXPLAIN_RULES}\n\n${qaText(body as QA)}\n\nReply with only this JSON object: {"confident": boolean, "explanation": string}`;
    modelTier = "complex";
  } else throw new Error("unknown call");
  try {
    const out = await sample.json<T>(prompt, { modelTier });
    if (path === "/explain") {
      const e = out as unknown as { confident?: unknown; explanation?: unknown };
      if (e.confident !== true || typeof e.explanation !== "string") return { confident: false, explanation: "" } as T;
    }
    return out;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) blocked = true;
    throw e;
  }
}
