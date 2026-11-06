// Detects whether the game runs as a Claude artifact and gives access to the
// runtime capabilities it declares (sample = ask Claude, db = account storage,
// user = who is viewing, downloads = save a file). Everything resolves to null
// outside an artifact, and the game falls back to local-only behaviour.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Use = (name: string) => Promise<any>;

export const IS_ARTIFACT_BUILD = import.meta.env.VITE_TARGET === "artifact";

function useFn(): Use | null {
  const c = (window as any).claude;
  return c && typeof c.use === "function" ? (c.use.bind(c) as Use) : null;
}

const cache = new Map<string, Promise<any>>();

export function capability<T = any>(name: string): Promise<T | null> {
  const use = useFn();
  if (!use) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, use(name).catch(() => null));
  return cache.get(name)!;
}

export interface SampleFn {
  (input: string, opts?: Record<string, unknown>): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, opts?: Record<string, unknown>): Promise<T>;
}

export const getSample = () => capability<SampleFn>("sample");

let uidPromise: Promise<string | null> | null = null;
export function getUserId(): Promise<string | null> {
  uidPromise ??= capability("user").then(async (u) => (u ? ((await u.id().catch(() => null)) as string | null) : null));
  return uidPromise;
}

/** Offer a file to the viewer. Returns false when this view cannot save files. */
export async function saveFile(filename: string, data: Blob): Promise<"saved" | "declined" | "unavailable"> {
  const dl = await capability("downloads");
  if (!dl) return "unavailable";
  try {
    await dl.save({ filename, data });
    return "saved";
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return code === "unavailable" ? "unavailable" : "declined";
  }
}
