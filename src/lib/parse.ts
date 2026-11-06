// Pure parsing + validation of question files. No browser APIs, so it is unit-tested in Node.
import type { Question, QuestionType } from "./types";

export interface RawQuestion {
  id?: unknown;
  tags?: unknown;
  topic?: unknown;
  type?: unknown;
  question?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
  source?: unknown;
  difficulty?: unknown;
  image?: unknown;
}

export interface Issue {
  file: string;
  item: number; // 1-based position in the file (0 = whole file)
  id?: string;
  level: "error" | "warning";
  message: string;
}

export interface ParsedQuestion extends Question {
  /** Image reference from the file (file name, data: URI or URL) still to be resolved. */
  imageRef?: string;
}

export interface ParseResult {
  title?: string;
  questions: ParsedQuestion[];
  issues: Issue[];
}

const TYPES: QuestionType[] = ["single", "multi", "truefalse", "typed"];

/** FNV-1a 32-bit, twice with different seeds, for a stable text fingerprint. */
export function fingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  const h = (seed: number) => {
    let x = seed >>> 0;
    for (let i = 0; i < norm.length; i++) {
      x ^= norm.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, "0");
  };
  return "fp:" + h(0x811c9dc5) + h(0x1b873593);
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? (v.trim() === "" ? undefined : v) : typeof v === "number" ? String(v) : undefined;

/** Phrases that suggest identifiable patient data. Warn only; never block. */
const PHI_PATTERNS: [RegExp, string][] = [
  [/\b(DOB|date of birth|geb\.|geboren am|fecha de nacimiento)\b/i, "a date of birth"],
  [/\b(MRN|medical record|Fallnummer|Patientennummer|n[úu]mero de historia|NHC)\b/i, "a record/case number"],
  [/\b(Herr|Frau|Mr\.|Mrs\.|Ms\.|Sr\.|Sra\.)\s+[A-ZÄÖÜ][a-zäöüß]+/, "a patient name"],
  [/\b\d{1,2}[./]\d{1,2}[./](19|20)\d{2}\b/, "a full calendar date"],
];

function letterToIndex(s: string): number | null {
  const m = /^\s*([A-Za-z])\s*$/.exec(s);
  return m ? m[1].toUpperCase().charCodeAt(0) - 65 : null;
}

function resolveAnswer(
  type: QuestionType,
  options: string[],
  answer: unknown,
): { correct: number[]; answerText: string } | string {
  if (answer === undefined || answer === null || answer === "") return "missing answer";
  if (type === "typed") {
    const a = str(answer);
    return a ? { correct: [], answerText: a } : "typed questions need a text answer";
  }
  if (type === "truefalse") {
    const v = typeof answer === "boolean" ? answer : String(answer).trim().toLowerCase();
    const t = v === true || ["true", "t", "a", "yes", "richtig", "wahr", "verdadero", "v"].includes(String(v));
    const f = v === false || ["false", "f", "b", "no", "falsch", "falso"].includes(String(v));
    if (!t && !f) return `true/false answer must be true or false (got "${String(answer)}")`;
    return { correct: [t ? 0 : 1], answerText: t ? "True" : "False" };
  }
  const parts: unknown[] = Array.isArray(answer)
    ? answer
    : typeof answer === "string"
      ? answer.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
      : [answer];
  const idx: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") return `numeric answers are ambiguous (0- or 1-based?) — use the option letter, e.g. "B"`;
    const s = String(p);
    // Exact option text wins; otherwise a single letter A, B, C…
    const exact = options.findIndex((o) => o.trim() === s.trim());
    const i = exact >= 0 ? exact : letterToIndex(s);
    if (i === null || i < 0 || i >= options.length) return `answer "${s}" does not match any option`;
    if (!idx.includes(i)) idx.push(i);
  }
  if (type === "single" && idx.length !== 1) return "single-answer questions need exactly one correct option";
  idx.sort((a, b) => a - b);
  return {
    correct: idx,
    answerText: idx.map((i) => `${String.fromCharCode(65 + i)}. ${options[i]}`).join("\n"),
  };
}

export function normaliseQuestions(file: string, raw: RawQuestion[]): ParseResult {
  const issues: Issue[] = [];
  const out: ParsedQuestion[] = [];
  const seenIds = new Map<string, number>();
  const seenText = new Map<string, number>();

  raw.forEach((r, n) => {
    const item = n + 1;
    const id = str(r.id);
    const err = (message: string) => issues.push({ file, item, id, level: "error", message });
    const warn = (message: string) => issues.push({ file, item, id, level: "warning", message });
    if (!r || typeof r !== "object") return err("not an object");

    const question = str(r.question);
    if (!question) return err("missing question text");

    let options: string[] = Array.isArray(r.options)
      ? r.options.map((o) => (o === null || o === undefined ? "" : String(o)))
      : typeof r.options === "string"
        ? r.options.split("|").map((s) => s.trim())
        : [];
    options = options.filter((o) => o.trim() !== "");

    const typeRaw = (str(r.type) ?? "").toLowerCase();
    let type: QuestionType;
    if (TYPES.includes(typeRaw as QuestionType)) type = typeRaw as QuestionType;
    else if (typeRaw === "mcq" || typeRaw === "multiple-choice") type = "single";
    else if (typeRaw === "") {
      if (typeof r.answer === "boolean") type = "truefalse";
      else if (options.length === 0) type = "typed";
      else if (Array.isArray(r.answer) && r.answer.length > 1) type = "multi";
      else type = "single";
    } else return err(`unknown type "${typeRaw}" (use single, multi, truefalse or typed)`);

    if (type === "truefalse") options = ["True", "False"];
    if ((type === "single" || type === "multi") && options.length < 2) return err("needs at least two options");
    if (new Set(options.map((o) => o.trim())).size !== options.length) warn("two options have the same text");

    const ans = resolveAnswer(type, options, r.answer);
    if (typeof ans === "string") return err(ans);

    const key = id ?? fingerprint(question + "\u0000" + options.join("\u0000"));
    if (id) {
      if (seenIds.has(id)) return err(`duplicate id "${id}" (also item ${seenIds.get(id)})`);
      seenIds.set(id, item);
    }
    const textKey = question.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenText.has(textKey)) warn(`same question text as item ${seenText.get(textKey)}`);
    else seenText.set(textKey, item);

    let tags: string[] = [];
    if (Array.isArray(r.tags)) tags = r.tags.map((t) => String(t).trim()).filter(Boolean);
    else if (typeof r.tags === "string") tags = r.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    const topic = str(r.topic);
    if (topic && !tags.includes(topic)) tags.unshift(topic);
    if (tags.length === 0) tags = ["untagged"];

    let difficulty: number | undefined;
    if (r.difficulty !== undefined && r.difficulty !== "") {
      difficulty = Number(r.difficulty);
      if (!Number.isFinite(difficulty)) {
        warn(`difficulty "${String(r.difficulty)}" is not a number; ignored`);
        difficulty = undefined;
      }
    }

    const explanation = str(r.explanation);
    const allText = [question, ...options, explanation ?? ""].join("\n");
    for (const [re, what] of PHI_PATTERNS) {
      if (re.test(allText)) {
        warn(`may contain ${what} — make sure no identifiable patient data is included`);
        break;
      }
    }

    out.push({
      key,
      id,
      tags,
      type,
      question,
      options,
      correct: ans.correct,
      answerText: ans.answerText,
      explanation,
      source: str(r.source),
      difficulty,
      imageRef: str(r.image),
    });
  });

  return { questions: out, issues };
}

/** RFC-4180-ish CSV parser (quotes, escaped quotes, newlines inside quotes, ; or , delimiter). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

export function parseQuestionFile(name: string, text: string): ParseResult {
  const isCsv = /\.(csv|tsv|txt)$/i.test(name);
  if (!isCsv) {
    let data: unknown;
    try {
      data = JSON.parse(text.replace(/^﻿/, ""));
    } catch (e) {
      return { questions: [], issues: [{ file: name, item: 0, level: "error", message: `not valid JSON: ${(e as Error).message}` }] };
    }
    const obj = data as { questions?: unknown; title?: unknown };
    const list = Array.isArray(data) ? data : Array.isArray(obj?.questions) ? obj.questions : null;
    if (!list) {
      return { questions: [], issues: [{ file: name, item: 0, level: "error", message: 'expected a "questions" array' }] };
    }
    const res = normaliseQuestions(name, list as RawQuestion[]);
    return { ...res, title: typeof obj?.title === "string" ? obj.title : undefined };
  }
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return { questions: [], issues: [{ file: name, item: 0, level: "error", message: "CSV has no data rows" }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("question")) {
    return { questions: [], issues: [{ file: name, item: 0, level: "error", message: 'CSV needs a header row with at least "question" and "answer" columns' }] };
  }
  const raw: RawQuestion[] = rows.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    // In CSV, options are separated by "|" and multi answers by ";"
    if (typeof o.options === "string") o.options = (o.options as string).split("|").map((s) => s.trim()).filter(Boolean);
    if (typeof o.tags === "string") o.tags = (o.tags as string).split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    return o as RawQuestion;
  });
  return normaliseQuestions(name, raw);
}

/** Merge results from several files, rejecting ids duplicated across files. */
export function mergeResults(results: { file: string; res: ParseResult }[]): ParseResult {
  const issues: Issue[] = [];
  const questions: ParsedQuestion[] = [];
  const keys = new Map<string, string>();
  for (const { file, res } of results) {
    issues.push(...res.issues);
    for (const q of res.questions) {
      if (keys.has(q.key)) {
        issues.push({ file, item: 0, id: q.id, level: "error", message: `duplicate ${q.id ? `id "${q.id}"` : "question"} also in ${keys.get(q.key)}` });
        continue;
      }
      keys.set(q.key, file);
      questions.push(q);
    }
  }
  return { questions, issues };
}

/** Lenient comparison for offline typed answers. */
export function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}.%/]+/gu, " ")
    .trim();
}
