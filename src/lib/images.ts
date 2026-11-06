import { useEffect, useState } from "react";
import { db, type StoredImage } from "./db";
import { pushImage } from "./sync";

/** Resize + compress an image file/blob in the browser. ECGs etc. keep up to 2000px on the long side. */
export async function compressImage(blob: Blob, maxDim = 2000, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  if (blob.type === "image/svg+xml") return { blob, width: 0, height: 0 };
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // Keep transparency (PNG) when the picture really uses it; otherwise JPEG on white.
  let alpha = false;
  if (/png|webp|gif/.test(blob.type)) {
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) { alpha = true; break; }
  }
  if (!alpha) {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  const out = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("compression failed"))), alpha ? "image/png" : "image/jpeg", quality),
  );
  // Keep the original when it is already smaller (e.g. well-compressed JPEG at small size).
  return out.size < blob.size || scale < 1 ? { blob: out, width: w, height: h } : { blob, width: w, height: h };
}

export async function storeImage(id: string, blob: Blob, kind: StoredImage["kind"], maxDim?: number): Promise<StoredImage> {
  const c = await compressImage(blob, maxDim);
  const rec: StoredImage = { id, blob: c.blob, kind, width: c.width, height: c.height, bytes: c.blob.size, createdAt: Date.now() };
  await (await db()).put("images", rec);
  if (kind !== "question") pushImage(id);
  forgetImageUrl(id);
  imagesChanged();
  return rec;
}

export function dataUriToBlob(uri: string): Blob {
  const [head, data] = uri.split(",", 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = head.includes(";base64") ? atob(data) : decodeURIComponent(data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const urlCache = new Map<string, string>();

/** Object URL for a stored image, loaded only when needed. */
export async function imageUrl(id: string): Promise<string | undefined> {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await (await db()).get("images", id);
  if (!rec) return undefined;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

/** Stored image as a URL plus its type (to know whether it has transparency). null = none stored. */
export function useStoredImage(id: string | undefined, version = 0): { url: string; type: string } | null | undefined {
  const [state, setState] = useState<{ url: string; type: string } | null | undefined>(undefined);
  const [changed, setChanged] = useState(0);
  useEffect(() => onImagesChanged(() => setChanged((v) => v + 1)), []);
  useEffect(() => {
    let live = true;
    if (!id) {
      setState(null);
      return;
    }
    setState(undefined);
    void (async () => {
      const rec = await (await db()).get("images", id);
      const url = rec ? await imageUrl(id) : undefined;
      if (live) setState(rec && url ? { url, type: rec.blob.type } : null);
    })();
    return () => {
      live = false;
    };
  }, [id, version, changed]);
  return state;
}

/** Notify listeners (pictures on screen) that an image changed. */
const imgListeners = new Set<() => void>();
export function onImagesChanged(fn: () => void) {
  imgListeners.add(fn);
  return () => {
    imgListeners.delete(fn);
  };
}
export function imagesChanged() {
  imgListeners.forEach((f) => f());
}

export function forgetImageUrl(id: string) {
  const u = urlCache.get(id);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(id);
}

export async function deleteImage(id: string) {
  forgetImageUrl(id);
  await (await db()).delete("images", id);
  pushImage(id); // removes the synced copy
  imagesChanged();
}
