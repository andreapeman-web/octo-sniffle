// Study RPG AI proxy (Cloudflare Worker).
// Keeps the Anthropic API key off the device. Three JSON endpoints:
//   POST /narrate  -> DM narration for a stop (or a rest), monster intros, hit/miss lines
//   POST /grade    -> is a typed answer satisfactory compared with the reference answer?
//   POST /explain  -> explanation from general knowledge ONLY when confident
// Every request must carry the header  X-App-Token: <APP_TOKEN>.
import Anthropic from "@anthropic-ai/sdk";

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  /** Comma-separated origins allowed to call the proxy, e.g. "https://you.github.io". "*" allows any. */
  ALLOWED_ORIGINS?: string;
  /** Optional model override, e.g. "claude-haiku-5-5" to cut cost. */
  MODEL?: string;
}

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_BODY = 40_000;

type Effort = "low" | "medium" | "high";

function cors(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").split(",").map((s) => s.trim());
  const ok = allowed.includes("*") || (origin !== null && allowed.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

/** One structured-output call. Returns parsed JSON, or throws. */
async function callClaude<T>(env: Env, system: string, user: string, schema: Record<string, unknown>, effort: Effort): Promise<T> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: env.MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    // Medical wording can trip a safety classifier; let the API re-run a declined request on its recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "refusal") throw new Error("refused");
  if (res.stop_reason === "max_tokens") throw new Error("truncated");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text) as T;
}

// ---------- Prompts & schemas ----------

const DM_SYSTEM = `You are the Dungeon Master of a single-player study game. The player answers medical exam questions; correct answers are hits, wrong answers are the monster's hits. Your job is only flavour text.
Rules:
- Stay grounded in the adventure facts you are given. Do not invent new major characters, places or plot twists.
- The route is fixed. Never offer the player choices or ask where to go.
- Write in second person ("you"), past and present tense as natural, in English.
- No dice, rules or numbers in the prose. No gore beyond fantasy-adventure level.
- Never mention medicine, questions or the exam.`;

const NARRATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narration", "intros", "hitLines", "missLines"],
  properties: {
    narration: { type: "string", description: "3 to 6 sentences" },
    intros: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["monsterId", "line"],
        properties: { monsterId: { type: "string" }, line: { type: "string" } },
      },
    },
    hitLines: { type: "array", items: { type: "string" } },
    missLines: { type: "array", items: { type: "string" } },
  },
};

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
  const lines = [
    `Adventure: ${r.adventure.title}`,
    `Synopsis: ${r.adventure.synopsis}`,
    r.chapter && `Chapter: ${r.chapter}`,
    `Hero: ${r.character.name}, level ${r.character.level}.`,
    r.previous && `What happened just before: ${r.previous}`,
  ];
  if (r.kind === "stop") {
    lines.push(
      `Next location: ${r.location} — ${r.description}`,
      `Module text for this stop (stay faithful to it): ${r.storyText}`,
      `Monsters waiting here: ${(r.monsters ?? []).map((m) => `${m.id} = ${m.name}${m.description ? ` (${m.description})` : ""}`).join("; ")}`,
      "Write: narration (3–6 sentences) of the hero travelling to and arriving at this location, ending as the monsters appear;",
      "intros: one short line per monster id introducing it;",
      "hitLines: 6 varied one-line descriptions of the hero landing a blow on these monsters;",
      "missLines: 6 varied one-line descriptions of these monsters striking the hero.",
    );
  } else if (r.kind === "rest" || r.kind === "knockout") {
    lines.push(
      `Safe place: ${r.safePlace?.name} — ${r.safePlace?.description}`,
      r.kind === "knockout"
        ? "The hero was knocked unconscious in the last fight and wakes up here, rescued by locals. Write narration (3–5 sentences) of waking and starting to recover through study and rest."
        : "Write narration (3–5 sentences) of the hero briefly travelling back here to rest and recover.",
      "Leave intros, hitLines and missLines as empty arrays.",
    );
  } else {
    lines.push(`Ending text from the module: ${r.storyText}`, "Write narration (4–6 sentences) for the ending. Leave the arrays empty.");
  }
  return lines.filter(Boolean).join("\n");
}

const GRADE_SYSTEM = `You grade a typed answer to a medical exam question against the reference answer from the student's own question file.
- The reference answer is the standard. Judge whether the student's answer contains its essential point(s), allowing synonyms, abbreviations, other languages (English, German, Spanish) and minor spelling errors.
- Missing an essential element, adding a clinically wrong statement, or a wrong number/unit/dose makes it unsatisfactory.
- Do not add facts beyond what is needed to explain the verdict. Feedback: one or two short sentences in English.`;

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["satisfactory", "feedback"],
  properties: { satisfactory: { type: "boolean" }, feedback: { type: "string" } },
};

const EXPLAIN_SYSTEM = `You explain why an answer to a medical exam question is correct, for a doctor studying for certification. The question file has no explanation for this item.
- Only explain when you are confident the explanation is accurate and consistent with the reference answer from the question file.
- If you are not confident, or the reference answer looks doubtful or depends on a local guideline you cannot verify, set confident=false and leave explanation empty. Never guess and never invent drug doses, thresholds, numbers or citations.
- If confident: 2–5 sentences in English, plain text, exact units, no hedged filler.`;

const EXPLAIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["confident", "explanation"],
  properties: { confident: { type: "boolean" }, explanation: { type: "string" } },
};

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

// ---------- Router ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(env, req.headers.get("Origin"));
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    if (req.headers.get("X-App-Token") !== env.APP_TOKEN || !env.APP_TOKEN) return json({ error: "unauthorized" }, 401, h);
    if (req.method === "GET" && path === "/health") return json({ ok: true, model: env.MODEL || DEFAULT_MODEL }, 200, h);
    if (req.method !== "POST") return json({ error: "not found" }, 404, h);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "request too large" }, 413, h);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400, h);
    }

    try {
      if (path === "/narrate") {
        const out = await callClaude(env, DM_SYSTEM, narratePrompt(body as NarrateReq), NARRATE_SCHEMA, "low");
        return json(out, 200, h);
      }
      if (path === "/grade") {
        const out = await callClaude(env, GRADE_SYSTEM, qaText(body as QA), GRADE_SCHEMA, "medium");
        return json(out, 200, h);
      }
      if (path === "/explain") {
        const out = await callClaude<{ confident: boolean; explanation: string }>(env, EXPLAIN_SYSTEM, qaText(body as QA), EXPLAIN_SCHEMA, "high");
        if (!out.confident) out.explanation = "";
        return json(out, 200, h);
      }
      return json({ error: "not found" }, 404, h);
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? (e.status ?? 502) : 502;
      return json({ error: (e as Error).message || "upstream error" }, status >= 500 || status === 429 ? status : 502, h);
    }
  },
};
