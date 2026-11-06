// Reads an adventure PDF in the browser (pdf.js). The file never leaves the device;
// only the extracted text (and, for scanned pages, page images) goes to Claude.
// The worker is bundled with the app and started from a blob: URL, so nothing is
// fetched from the network.
import * as pdfjs from "pdfjs-dist/build/pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.js?raw";

let ready = false;
function init() {
  if (ready) return;
  const url = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
  pdfjs.GlobalWorkerOptions.workerSrc = url;
  ready = true;
}

export interface PdfPage {
  n: number;
  text: string;
  /** True when the page has (almost) no text layer: probably a scan or a full-page picture. */
  scanned: boolean;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Turn a page's text items into reading order. Handles two-column layouts by
 * splitting at the page middle when both halves are well filled.
 */
function pageText(items: TextItem[], pageWidth: number): string {
  const its = items.filter((i) => i.str.trim() !== "");
  if (!its.length) return "";
  const mid = pageWidth / 2;
  const left = its.filter((i) => i.transform[4] + i.width <= mid + 4);
  const right = its.filter((i) => i.transform[4] >= mid - 4);
  const twoCol = left.length > its.length * 0.3 && right.length > its.length * 0.3 && left.length + right.length >= its.length * 0.9;
  const lines = (group: TextItem[]) => {
    const sorted = [...group].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const out: string[] = [];
    let y = Infinity;
    let line = "";
    for (const i of sorted) {
      const iy = i.transform[5];
      if (Math.abs(iy - y) > Math.max(2, (i.height || 10) * 0.5)) {
        if (line) out.push(line);
        line = i.str;
        y = iy;
      } else line += (line.endsWith(" ") || i.str.startsWith(" ") ? "" : " ") + i.str;
    }
    if (line) out.push(line);
    return out.join("\n");
  };
  if (!twoCol) return lines(its);
  const spanning = its.filter((i) => !left.includes(i) && !right.includes(i));
  return [lines(spanning), lines(left), lines(right)].filter(Boolean).join("\n");
}

export async function readPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<{ pages: PdfPage[]; doc: unknown }> {
  init();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const text = pageText(tc.items as TextItem[], vp.width);
    pages.push({ n, text, scanned: text.replace(/\s/g, "").length < 40 });
    page.cleanup();
    onProgress?.(n, doc.numPages);
  }
  return { pages, doc };
}

/** Render one page to a JPEG (for scanned pages that need Claude to read the picture). */
export async function renderPage(doc: unknown, n: number, maxDim = 1400): Promise<Blob> {
  const d = doc as { getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }> };
  const page = await d.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxDim / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/jpeg", 0.82));
}
