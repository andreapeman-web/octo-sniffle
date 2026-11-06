import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as RPointerEvent } from "react";
import { useApp } from "../App";
import { mapFor } from "../art/MapView";
import { sceneUrl } from "../art/scenes";
import { heroPalette, spriteFor, spriteUrl } from "../art/sprites";
import { Modal, TopBar } from "../components/ui";
import { assetId, setPins, usePins, type Pins } from "../lib/art";
import { db } from "../lib/db";
import { deleteImage, storeImage, useStoredImage } from "../lib/images";
import { assetList, matchFile, type AssetItem } from "../lib/moduleImport";
import { readPdf, renderPage } from "../lib/pdf";
import { getModulePdf, setModulePdf } from "../lib/pdfSession";
import type { Adventure } from "../lib/types";

const MAX_DIM: Record<AssetItem["kind"], number> = { hero: 700, monster: 700, location: 1400, safe: 1400, map: 2000 };

function defaultArt(adv: Adventure, it: AssetItem): string {
  if (it.kind === "hero") return spriteUrl("hero", heroPalette(adv.recommendedLevel));
  if (it.kind === "monster") {
    const m = adv.monsters[it.id];
    return spriteUrl(spriteFor(m?.name ?? it.name, m?.sprite));
  }
  if (it.kind === "location") return sceneUrl(mapFor(adv).locations[it.id]?.terrain ?? "field");
  if (it.kind === "safe") return sceneUrl(adv.map?.safePlaces?.[it.id]?.terrain ?? "temple");
  return "";
}

const GROUPS: { kind: AssetItem["kind"]; title: string }[] = [
  { kind: "hero", title: "Your hero" },
  { kind: "monster", title: "Monsters" },
  { kind: "location", title: "Locations" },
  { kind: "safe", title: "Places to rest" },
  { kind: "map", title: "Map" },
];

export function ArtScreen() {
  const { adventure, go } = useApp();
  const items = useMemo(() => (adventure ? assetList(adventure) : []), [adventure]);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<{ file: File; target?: AssetItem }[]>([]);
  const [cropFor, setCropFor] = useState<AssetItem | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pdfBusy, setPdfBusy] = useState("");
  const bulkRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!adventure) return;
    void (async () => {
      const d = await db();
      const keys = (await d.getAllKeys("images")).map(String);
      setHave(new Set(keys));
    })();
  }, [adventure, version]);

  if (!adventure) return null;
  const idOf = (it: AssetItem) => assetId(adventure.id, it.kind, it.id);
  const provided = items.filter((it) => have.has(idOf(it))).length;

  const save = async (it: AssetItem, blob: Blob) => {
    await storeImage(idOf(it), blob, "asset", MAX_DIM[it.kind]);
    setVersion((v) => v + 1);
  };

  const bulk = (files: FileList) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setPending(list.map((file) => ({ file, target: matchFile(file.name, items) })));
  };

  const applyBulk = async () => {
    let n = 0;
    for (const p of pending) {
      if (!p.target) continue;
      await save(p.target, p.file);
      n++;
    }
    setPending([]);
    setMsg(`${n} picture${n === 1 ? "" : "s"} added.`);
  };

  const openPdf = async (f: File) => {
    setPdfBusy("Opening the PDF…");
    try {
      const { doc } = await readPdf(f, (d, t) => setPdfBusy(`Opening the PDF… ${d}/${t}`));
      setModulePdf(doc);
      setPdfBusy("");
    } catch (e) {
      setPdfBusy("");
      setMsg(`Could not open the PDF: ${(e as Error).message}`);
    }
  };

  return (
    <main className="screen">
      <TopBar title="Art checklist" onBack={() => go("home")} />
      <section className="parchment">
        <h2>{adventure.title}</h2>
        <p>
          <b>{provided}</b> of {items.length} pictures are yours. Anything you don't provide uses the built-in art, so you can start playing now and add pictures any time.
        </p>
        <div className="row">
          <button className="btn" onClick={() => bulkRef.current?.click()}>Upload several pictures</button>
          {getModulePdf() ? (
            <span className="muted small">Module PDF open: use “From the PDF” on any item.</span>
          ) : (
            <button className="btn" onClick={() => pdfRef.current?.click()} disabled={!!pdfBusy}>{pdfBusy || "Open the module PDF to take pictures from it"}</button>
          )}
        </div>
        <p className="muted small">Name files after what they show (e.g. <code>goblin.png</code>, <code>bramble-ford.jpg</code>, <code>map.jpg</code>) and they are matched automatically. Pictures stay private to you.</p>
        <input ref={bulkRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) bulk(e.target.files); e.target.value = ""; }} />
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void openPdf(f); }} />
        {msg && <p className="notice">{msg}</p>}
        <button className="btn primary wide" onClick={() => go("newrun")}>Play this adventure</button>
      </section>

      {pending.length > 0 && (
        <section className="parchment">
          <h3>Match your pictures</h3>
          {pending.map((p, i) => (
            <div key={i} className="match-row">
              <img src={URL.createObjectURL(p.file)} alt="" />
              <div className="grow">
                <div className="small">{p.file.name}</div>
                <select
                  value={p.target ? `${p.target.kind}:${p.target.id}` : ""}
                  onChange={(e) => setPending((all) => all.map((x, j) => (j === i ? { ...x, target: items.find((it) => `${it.kind}:${it.id}` === e.target.value) } : x)))}
                  aria-label={`Use ${p.file.name} for`}
                >
                  <option value="">Skip this picture</option>
                  {items.map((it) => <option key={`${it.kind}:${it.id}`} value={`${it.kind}:${it.id}`}>{GROUPS.find((g) => g.kind === it.kind)?.title}: {it.name}</option>)}
                </select>
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn primary" onClick={applyBulk}>Use these pictures</button>
            <button className="btn" onClick={() => setPending([])}>Cancel</button>
          </div>
        </section>
      )}

      {GROUPS.map((g) => {
        const list = items.filter((it) => it.kind === g.kind);
        if (!list.length) return null;
        return (
          <section className="parchment" key={g.kind}>
            <h3>{g.title}</h3>
            <div className="asset-list">
              {list.map((it) => (
                <AssetRow
                  key={`${it.kind}:${it.id}`}
                  adv={adventure}
                  it={it}
                  id={idOf(it)}
                  mine={have.has(idOf(it))}
                  onFile={(f) => save(it, f)}
                  onRemove={async () => { await deleteImage(idOf(it)); setVersion((v) => v + 1); }}
                  onFromPdf={getModulePdf() ? () => setCropFor(it) : undefined}
                  onPins={it.kind === "map" && have.has(idOf(it)) ? () => setPinning(true) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}

      {cropFor && (
        <PdfCropper
          doc={getModulePdf()}
          title={`Picture for ${cropFor.name}`}
          startPage={Number(/p\. (\d+)/.exec(cropFor.note ?? "")?.[1] ?? 1)}
          onClose={() => setCropFor(null)}
          onPick={async (blob) => {
            await save(cropFor, blob);
            setCropFor(null);
            setMsg(`Picture added for ${cropFor.name}.`);
          }}
        />
      )}
      {pinning && <PinEditor adv={adventure} onClose={() => setPinning(false)} />}
    </main>
  );
}

function AssetRow({ adv, it, id, mine, onFile, onRemove, onFromPdf, onPins }: {
  adv: Adventure; it: AssetItem; id: string; mine: boolean;
  onFile: (f: File) => void; onRemove: () => void; onFromPdf?: () => void; onPins?: () => void;
}) {
  const img = useStoredImage(mine ? id : undefined);
  const ref = useRef<HTMLInputElement>(null);
  const fallback = defaultArt(adv, it);
  return (
    <div className={`asset-row ${mine ? "is-mine" : ""}`}>
      <div className={`asset-thumb thumb-${it.kind}`}>
        {img ? <img src={img.url} alt="" /> : fallback ? <img className="pixel" src={fallback} alt="" /> : <span className="muted small">drawn map</span>}
      </div>
      <div className="grow">
        <div className="asset-name">
          <b>{it.name}</b>
          <span className={`chip ${mine ? "chip-mine" : ""}`}>{mine ? "your picture" : "built-in art"}</span>
        </div>
        <p className="muted small">{it.hint}</p>
        {it.note && <p className="small art-note">📖 {it.note}</p>}
        <div className="row">
          <button className="btn small" onClick={() => ref.current?.click()}>{mine ? "Replace" : "Upload"}</button>
          {onFromPdf && <button className="btn small" onClick={onFromPdf}>From the PDF</button>}
          {onPins && <button className="btn small" onClick={onPins}>Place locations</button>}
          {mine && <button className="btn small ghost" onClick={onRemove}>Use built-in art</button>}
        </div>
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      </div>
    </div>
  );
}

/** Browse the module PDF and drag a rectangle around a picture to use it. */
function PdfCropper({ doc, title, startPage, onPick, onClose }: { doc: unknown; title: string; startPage: number; onPick: (b: Blob) => void; onClose: () => void }) {
  const total = (doc as { numPages: number }).numPages;
  const [page, setPage] = useState(Math.min(Math.max(1, startPage), total));
  const [src, setSrc] = useState<string>();
  const [sel, setSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    setSrc(undefined);
    setSel(null);
    void renderPage(doc, page, 2000).then((b) => {
      if (!live) return;
      blobRef.current = b;
      setSrc(URL.createObjectURL(b));
    });
    return () => {
      live = false;
    };
  }, [doc, page]);

  const rel = (e: RPointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const use = async () => {
    if (!blobRef.current) return;
    const bmp = await createImageBitmap(blobRef.current);
    const s = sel && Math.abs(sel.x1 - sel.x0) > 0.02 && Math.abs(sel.y1 - sel.y0) > 0.02 ? sel : { x0: 0, y0: 0, x1: 1, y1: 1 };
    const x = Math.min(s.x0, s.x1) * bmp.width;
    const y = Math.min(s.y0, s.y1) * bmp.height;
    const w = Math.abs(s.x1 - s.x0) * bmp.width;
    const h = Math.abs(s.y1 - s.y0) * bmp.height;
    const c = document.createElement("canvas");
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext("2d")!.drawImage(bmp, x, y, w, h, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onPick(b), "image/jpeg", 0.9);
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="row cropper-nav">
        <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Page</button>
        <label className="small">
          Page <input type="number" min={1} max={total} value={page} onChange={(e) => setPage(Math.min(total, Math.max(1, +e.target.value || 1)))} style={{ width: 80 }} /> of {total}
        </label>
        <button className="btn small" disabled={page >= total} onClick={() => setPage(page + 1)}>Page ›</button>
      </div>
      <p className="muted small">Drag a box around the picture you want. Without a box, the whole page is used.</p>
      <div
        className="cropper"
        onPointerDown={(e) => {
          if (!imgRef.current) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const p = rel(e);
          drag.current = p;
          setSel({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = rel(e);
          setSel((s) => (s ? { ...s, x1: p.x, y1: p.y } : s));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {src ? <img ref={imgRef} src={src} alt={`Page ${page}`} draggable={false} /> : <p className="muted">Rendering page…</p>}
        {sel && (
          <div
            className="crop-box"
            style={{ left: `${Math.min(sel.x0, sel.x1) * 100}%`, top: `${Math.min(sel.y0, sel.y1) * 100}%`, width: `${Math.abs(sel.x1 - sel.x0) * 100}%`, height: `${Math.abs(sel.y1 - sel.y0) * 100}%` }}
          />
        )}
      </div>
      <div className="row">
        <button className="btn primary" disabled={!src} onClick={use}>Use {sel ? "this area" : "the whole page"}</button>
        {sel && <button className="btn" onClick={() => setSel(null)}>Clear box</button>}
      </div>
    </Modal>
  );
}

/** Tap the map picture to place each location in order. */
function PinEditor({ adv, onClose }: { adv: Adventure; onClose: () => void }) {
  const img = useStoredImage(assetId(adv.id, "map", "main"));
  const saved = usePins(adv.id);
  const [pins, set] = useState<Pins>({});
  const locs = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const s of adv.stops) if (!out.some((x) => x.id === s.locationId)) out.push({ id: s.locationId, name: s.location });
    return out;
  }, [adv]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    set(saved);
    const first = locs.findIndex((l) => !saved[l.id]);
    setActive(first >= 0 ? first : 0);
  }, [saved, locs]);

  const place = (e: ReactMouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    const next = { ...pins, [locs[active].id]: p };
    set(next);
    const nextEmpty = locs.findIndex((l, i) => i > active && !next[l.id]);
    if (nextEmpty >= 0) setActive(nextEmpty);
    else if (active + 1 < locs.length) setActive(active + 1);
  };

  return (
    <Modal title="Place locations on your map" onClose={onClose}>
      <p className="small">
        Tap the map where <b>{active + 1}. {locs[active]?.name}</b> is. Tap a name below to move another one.
      </p>
      <div className="pin-editor" onClick={place}>
        {img && <img src={img.url} alt="Your map" draggable={false} />}
        {locs.map((l, i) => pins[l.id] && (
          <div key={l.id} className={`pin ${i === active ? "pin-here" : "pin-done"}`} style={{ left: `${pins[l.id].x}%`, top: `${pins[l.id].y}%` }}>{i + 1}</div>
        ))}
      </div>
      <div className="pin-list">
        {locs.map((l, i) => (
          <button key={l.id} className={`chip ${i === active ? "chip-mine" : ""}`} onClick={() => setActive(i)}>
            {i + 1}. {l.name} {pins[l.id] ? "✓" : ""}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" onClick={async () => { await setPins(adv.id, pins); onClose(); }}>Save pins</button>
        <button className="btn" onClick={async () => { set({}); setActive(0); await setPins(adv.id, {}); }}>Clear all</button>
      </div>
    </Modal>
  );
}
