// ---------- Questions ----------

export type QuestionType = "single" | "multi" | "truefalse" | "typed";

/** A question as stored on the device (normalised from the uploaded file). */
export interface Question {
  /** Stable key: the file's id, or "fp:<hash>" of the question text when it has none. */
  key: string;
  id?: string;
  tags: string[];
  type: QuestionType;
  question: string;
  options: string[];
  /** Indexes into options (single/multi/truefalse). Empty for typed questions. */
  correct: number[];
  /** Reference answer text (typed questions) or a readable form of the correct option(s). */
  answerText: string;
  explanation?: string;
  source?: string;
  difficulty?: number;
  /** Id of an image in the images store. */
  imageId?: string;
  /** Remote URL used as-is when the file points at the web (not cached offline). */
  imageUrl?: string;
}

export interface Mark {
  key: string;
  markedAt: number;
  wrongCount: number;
  /** Copy of the question so marks survive a new upload that doesn't include it. */
  snapshot: Question;
}

export interface QuestionStat {
  key: string;
  seen: number;
  correct: number;
  wrong: number;
  lastSeen: number;
  /** Leitner box 1..5 */
  box: number;
  due: number;
}

export interface TopicStat {
  tag: string;
  answered: number;
  correct: number;
}

export interface UploadInfo {
  title: string;
  files: string[];
  count: number;
  tags: string[];
  uploadedAt: number;
}

// ---------- Adventure ----------

export interface Attack {
  name: string;
  /** Fixed average damage as listed in the stat block. */
  damage: number;
  text?: string;
}

export interface Monster {
  id: string;
  name: string;
  hp: number;
  ac?: number;
  /** Damage dealt to the player per wrong answer (average of its main attack / multiattack). */
  hitDamage: number;
  attacks: Attack[];
  xp: number;
  cr?: string;
  /** Where the stat block comes from, e.g. "Module p.12" or "5e SRD 5.1 (CC-BY-4.0)". */
  source: string;
  description?: string;
  icon?: string;
}

export interface EncounterDef {
  id: string;
  name: string;
  boss?: boolean;
  monsters: { monsterId: string; count: number }[];
}

export interface Stop {
  id: string;
  chapterId: string;
  location: string;
  locationId: string;
  /** Fallback narration (used offline or when the AI is unavailable). */
  narration: string;
  /** Short description of the place for the AI DM. */
  description: string;
  safePlaceId: string;
  encounter: EncounterDef;
}

export interface SafePlace {
  id: string;
  name: string;
  description: string;
}

export interface Chapter {
  id: string;
  title: string;
}

export interface Adventure {
  format: "study-rpg-adventure";
  version: 1;
  id: string;
  title: string;
  author?: string;
  recommendedLevel: number;
  styleGuide?: string;
  synopsis: string;
  intro: string;
  ending: string;
  chapters: Chapter[];
  safePlaces: SafePlace[];
  monsters: Record<string, Monster>;
  stops: Stop[];
  hitLines: string[];
  missLines: string[];
  credits?: string;
}

// ---------- Run / character ----------

export interface Badge {
  id: string;
  name: string;
  icon: string;
  earnedAt: number;
}

export interface PortraitVersion {
  level: number;
  imageId: string;
  at: number;
}

export interface Character {
  name: string;
  level: number;
  xp: number;
  hp: number;
  portraitId?: string;
  portraitHistory: PortraitVersion[];
  badges: Badge[];
}

export type Phase =
  | "narration" // story text before a stop's fight
  | "combat"
  | "results" // after a fight
  | "rest" // at a safe place, mock combats
  | "done";

export interface FightLogEntry {
  qkey: string;
  correct: boolean;
}

export interface Run {
  adventureId: string;
  character: Character;
  stopIndex: number;
  /** Index into the expanded monster lineup of the current encounter. */
  foeIndex: number;
  foeHp: number;
  phase: Phase;
  /** Where to return after resting. */
  restReturn?: Phase;
  knockedOut: boolean;
  monsterOverrides: Record<string, Partial<Monster>>;
  /** The current/last fight: answers and XP. */
  fight: { log: FightLogEntry[]; xp: number; defeated: string[]; knockouts: number; leveledTo?: number };
  stats: {
    answered: number;
    correct: number;
    defeated: string[]; // monster ids (one entry per individual monster)
    visited: string[]; // location ids
    knockouts: number;
    startedAt: number;
    finishedAt?: number;
  };
  /** Set by the level-up flow to ask for a new portrait. */
  pendingPortraitLevel?: number;
  updatedAt: number;
}

export interface LevelRow {
  level: number;
  xp: number;
  maxHp: number;
  damage: number;
}

export interface Settings {
  difficulty: number; // 0.25 .. 1
  sound: boolean;
  proxyUrl: string;
  proxyToken: string;
  selectedTags: string[] | null; // null = all
  lastExport?: number;
  activeAdventureId?: string;
}

export interface NarrationBundle {
  key: string;
  narration: string;
  intros: Record<string, string>;
  hitLines: string[];
  missLines: string[];
  ai: boolean;
}
