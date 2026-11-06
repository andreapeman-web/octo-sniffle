// The player's own art for an adventure: picture ids and map pins.
import { useEffect, useState } from "react";
import { kvGet, kvSet } from "./db";
import { pushKv } from "./sync";

export type AssetKind = "monster" | "location" | "safe" | "map" | "hero";

export const assetId = (advId: string, kind: AssetKind, id: string) => `asset:${advId}:${kind}:${id}`;

export type Pins = Record<string, { x: number; y: number }>;

const listeners = new Set<() => void>();

export async function getPins(advId: string): Promise<Pins> {
  return (await kvGet<{ pins?: Pins }>(`art:${advId}`))?.pins ?? {};
}

export async function setPins(advId: string, pins: Pins) {
  await kvSet(`art:${advId}`, { pins });
  pushKv(`art:${advId}`);
  listeners.forEach((f) => f());
}

export function usePins(advId: string | undefined): Pins {
  const [pins, set] = useState<Pins>({});
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    if (advId) void getPins(advId).then(set);
  }, [advId, v]);
  return pins;
}
