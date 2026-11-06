// Parchment overland map, drawn in SVG from the adventure's map data:
// water, rivers, forests, hills, mountains, marsh, numbered locations and the route.
import { useMemo } from "react";
import type { Adventure, AdventureMap, MapFeature } from "../lib/types";
import { terrainFor } from "./scenes";
import { assetId, usePins } from "../lib/art";
import { useStoredImage } from "../lib/images";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** A map for adventures that don't bring one: a winding road with scattered terrain. */
export function mapFor(adv: Adventure): AdventureMap {
  if (adv.map) return adv.map;
  const r = rng(hash(adv.id));
  const ids = [...new Set(adv.stops.map((s) => s.locationId))];
  const W = 1000;
  const H = 680;
  const locations: AdventureMap["locations"] = {};
  ids.forEach((id, i) => {
    const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
    const stop = adv.stops.find((s) => s.locationId === id)!;
    locations[id] = {
      x: 90 + t * (W - 180),
      y: H / 2 + Math.sin(t * Math.PI * 2.2) * (H * 0.28) + (r() - 0.5) * 60,
      terrain: terrainFor(`${stop.location} ${stop.description}`),
    };
  });
  const features: MapFeature[] = [];
  const kinds: MapFeature["type"][] = ["forest", "forest", "hills", "mountains", "marsh"];
  for (let i = 0; i < 9; i++) features.push({ type: kinds[i % kinds.length], x: r() * W, y: r() * H, r: 50 + r() * 60 });
  return { w: W, h: H, title: adv.title, locations, features };
}

/** Route through the stops in order, one point per distinct location. */
export function routeOf(adv: Adventure, map: AdventureMap) {
  const pts: { id: string; x: number; y: number; name: string; firstStop: number }[] = [];
  adv.stops.forEach((s, i) => {
    if (pts.length && pts[pts.length - 1].id === s.locationId) return;
    const l = map.locations[s.locationId];
    if (l) pts.push({ id: s.locationId, x: l.x, y: l.y, name: s.location, firstStop: i });
  });
  return pts;
}

function Forest({ f, seed }: { f: MapFeature; seed: number }) {
  const r = rng(seed);
  const trees = [];
  const n = Math.round((f.r ?? 60) / 6);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (f.r ?? 60);
    const x = (f.x ?? 0) + Math.cos(a) * d;
    const y = (f.y ?? 0) + Math.sin(a) * d * 0.7;
    const s = 9 + r() * 6;
    trees.push(
      <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        <ellipse cx="0" cy={s * 0.9} rx={s * 0.8} ry={s * 0.25} fill="#7a6a44" opacity="0.25" />
        <circle cx="0" cy="0" r={s * 0.75} fill="#7b8f52" stroke="#3b2a18" strokeWidth="1.4" />
        <path d={`M${-s * 0.35} ${-s * 0.1} q${s * 0.35} ${-s * 0.4} ${s * 0.7} 0`} fill="none" stroke="#3b2a18" strokeWidth="0.9" opacity="0.6" />
        <line x1="0" y1={s * 0.7} x2="0" y2={s * 1.05} stroke="#3b2a18" strokeWidth="1.6" />
      </g>,
    );
  }
  trees.sort((a, b) => Number(a.key) - Number(b.key));
  return <g>{trees}</g>;
}

function Peaks({ f, seed, hillsOnly }: { f: MapFeature; seed: number; hillsOnly?: boolean }) {
  const r = rng(seed);
  const out = [];
  const n = Math.round((f.r ?? 60) / (hillsOnly ? 14 : 11));
  const items: { x: number; y: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (f.r ?? 60);
    items.push({ x: (f.x ?? 0) + Math.cos(a) * d, y: (f.y ?? 0) + Math.sin(a) * d * 0.6, s: (hillsOnly ? 14 : 20) + r() * 14 });
  }
  items.sort((a, b) => a.y - b.y);
  for (const [i, { x, y, s }] of items.entries()) {
    if (hillsOnly) {
      out.push(
        <path key={i} d={`M${x - s} ${y} Q${x} ${y - s * 0.9} ${x + s} ${y}`} fill="#cdb98a" stroke="#3b2a18" strokeWidth="1.4" />,
      );
    } else {
      out.push(
        <g key={i}>
          <path d={`M${x - s} ${y} L${x - s * 0.1} ${y - s * 1.3} L${x + s} ${y} Z`} fill="#d9c79c" stroke="#3b2a18" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={`M${x - s * 0.1} ${y - s * 1.3} L${x + s} ${y} L${x + s * 0.15} ${y} Z`} fill="#9c8558" opacity="0.8" />
          <path d={`M${x - s * 0.35} ${y - s * 0.85} L${x - s * 0.1} ${y - s * 1.3} L${x + s * 0.18} ${y - s * 0.95}`} fill="#f4ecd6" stroke="#3b2a18" strokeWidth="0.8" />
        </g>,
      );
    }
  }
  return <g>{out}</g>;
}

function Marsh({ f, seed }: { f: MapFeature; seed: number }) {
  const r = rng(seed);
  const out = [];
  const n = Math.round((f.r ?? 60) / 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (f.r ?? 60);
    const x = (f.x ?? 0) + Math.cos(a) * d;
    const y = (f.y ?? 0) + Math.sin(a) * d * 0.6;
    out.push(
      <g key={i} stroke="#3b2a18" strokeWidth="1.1" fill="none">
        <path d={`M${x - 6} ${y} h12`} stroke="#5b7a8a" />
        <path d={`M${x - 3} ${y} l-2 -7 M${x} ${y} v-9 M${x + 3} ${y} l2 -7`} />
      </g>,
    );
  }
  return <g>{out}</g>;
}

const smooth = (pts: [number, number][], closed: boolean) => {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += closed ? ` Q${last[0]} ${last[1]} ${(last[0] + pts[0][0]) / 2} ${(last[1] + pts[0][1]) / 2} Z` : ` L${last[0]} ${last[1]}`;
  return d;
};

export interface MapProps {
  adv: Adventure;
  /** Index of the current stop (or stops.length when finished). */
  stopIndex: number;
  /** Animate the party token from the previous location. */
  travel?: boolean;
  compact?: boolean;
}

export function MapView(props: MapProps) {
  const img = useStoredImage(assetId(props.adv.id, "map", "main"));
  const pins = usePins(props.adv.id);
  if (img === undefined) return <div className={`map-frame ${props.compact ? "map-compact" : ""} map-wait`} />;
  if (img) return <PictureMap {...props} url={img.url} pins={pins} />;
  return <DrawnMap {...props} />;
}

/** The player's own map picture, with the route drawn through the pins they placed. */
function PictureMap({ adv, stopIndex, compact, url, pins }: MapProps & { url: string; pins: Record<string, { x: number; y: number }> }) {
  const stopsSeen: { id: string; name: string }[] = [];
  for (const s of adv.stops) if (!stopsSeen.some((x) => x.id === s.locationId)) stopsSeen.push({ id: s.locationId, name: s.location });
  const cur = adv.stops[Math.min(stopIndex, adv.stops.length - 1)];
  const done = stopIndex >= adv.stops.length;
  const curIdx = stopsSeen.findIndex((x) => x.id === cur?.locationId);
  const placed = stopsSeen.map((l, i) => ({ ...l, i, p: pins[l.id] })).filter((x) => x.p);
  return (
    <div className={`map-frame map-picture ${compact ? "map-compact" : ""}`}>
      <div className="map-picture-inner">
        <img src={url} alt={`Map of ${adv.title}`} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="map-route" aria-hidden="true">
          <polyline points={placed.map((x) => `${x.p!.x},${x.p!.y}`).join(" ")} fill="none" stroke="#7a2318" strokeWidth="3" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        </svg>
        {placed.map((x) => {
          const state = done || x.i < curIdx ? "done" : x.i === curIdx ? "here" : "todo";
          return (
            <div key={x.id} className={`pin pin-${state}`} style={{ left: `${x.p!.x}%`, top: `${x.p!.y}%` }} title={x.name}>
              {x.i + 1}
            </div>
          );
        })}
      </div>
      {placed.length === 0 && <p className="map-hint">Place the locations on your map from the art checklist.</p>}
    </div>
  );
}

function DrawnMap({ adv, stopIndex, travel, compact }: MapProps) {
  const map = useMemo(() => mapFor(adv), [adv]);
  const route = useMemo(() => routeOf(adv, map), [adv, map]);
  const cur = adv.stops[Math.min(stopIndex, adv.stops.length - 1)];
  const curIdx = Math.max(0, route.findIndex((p) => p.id === cur?.locationId));
  const done = stopIndex >= adv.stops.length;
  const here = route[curIdx];
  const prev = route[Math.max(0, curIdx - 1)];
  const seed = hash(adv.id);
  const routeD = route.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const walkedD = route.slice(0, curIdx + 1).map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");

  return (
    <div className={`map-frame ${compact ? "map-compact" : ""}`}>
      <svg viewBox={`0 0 ${map.w} ${map.h}`} role="img" aria-label={`Map of ${map.title ?? adv.title}`} className="map-svg">
        <defs>
          <radialGradient id="parch" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#f3e6c4" />
            <stop offset="70%" stopColor="#e6d2a3" />
            <stop offset="100%" stopColor="#c9ac74" />
          </radialGradient>
          <filter id="grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.16 0" />
          </filter>
          <filter id="rough">
            <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="5" result="t" />
            <feDisplacementMap in="SourceGraphic" in2="t" scale="10" />
          </filter>
        </defs>
        <rect width={map.w} height={map.h} fill="url(#parch)" />
        <rect width={map.w} height={map.h} filter="url(#grain)" />

        {map.features.filter((f) => f.type === "water").map((f, i) => (
          <g key={`w${i}`} filter="url(#rough)">
            <path d={smooth(f.points ?? [], true)} fill="#9fb8b8" stroke="#3b2a18" strokeWidth="2" />
            <path d={smooth(f.points ?? [], true)} fill="none" stroke="#6f9090" strokeWidth="8" opacity="0.35" transform="scale(0.985)" />
          </g>
        ))}
        {map.features.filter((f) => f.type === "river").map((f, i) => (
          <path key={`r${i}`} d={smooth(f.points ?? [], false)} fill="none" stroke="#7f9ea0" strokeWidth="9" strokeLinecap="round" filter="url(#rough)" />
        ))}
        {map.features.filter((f) => f.type === "marsh").map((f, i) => <Marsh key={`m${i}`} f={f} seed={seed + i * 13} />)}
        {map.features.filter((f) => f.type === "hills").map((f, i) => <Peaks key={`h${i}`} f={f} seed={seed + i * 17} hillsOnly />)}
        {map.features.filter((f) => f.type === "mountains").map((f, i) => <Peaks key={`p${i}`} f={f} seed={seed + i * 19} />)}
        {map.features.filter((f) => f.type === "forest").map((f, i) => <Forest key={`f${i}`} f={f} seed={seed + i * 23} />)}

        {/* route */}
        <path d={routeD} fill="none" stroke="#7a2318" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" opacity="0.55" />
        <path d={walkedD} fill="none" stroke="#7a2318" strokeWidth="4" strokeDasharray="10 7" strokeLinecap="round" />

        {map.features.filter((f) => f.label).map((f, i) => {
          const x = f.x ?? (f.points ? f.points.reduce((a, p) => a + p[0], 0) / f.points.length : 0);
          const y = f.y ?? (f.points ? f.points.reduce((a, p) => a + p[1], 0) / f.points.length : 0);
          return (
            <text key={`l${i}`} x={x} y={y + (f.type === "marsh" ? (f.r ?? 0) * 0.75 : f.type === "water" ? 44 : 4)} className="map-region" textAnchor="middle">
              {f.label}
            </text>
          );
        })}

        {route.map((p, i) => {
          const state = done || i < curIdx ? "done" : i === curIdx ? "here" : "todo";
          const above = i % 2 === 0;
          return (
            <g key={p.id} className={`map-loc map-${state}`}>
              {state === "here" && <circle cx={p.x} cy={p.y} r="26" className="map-pulse" />}
              <circle cx={p.x} cy={p.y} r="15" fill={state === "todo" ? "#efe2bf" : "#f7efd8"} stroke="#3b2a18" strokeWidth="2.2" />
              <text x={p.x} y={p.y + 6} textAnchor="middle" className="map-num">{i + 1}</text>
              <text x={p.x} y={above ? p.y - 24 : p.y + 38} textAnchor="middle" className="map-label">
                {state === "todo" && !done ? "?" : p.name}
              </text>
            </g>
          );
        })}

        {!done && here && (
          <g className={travel && prev && prev !== here ? "token token-travel" : "token"} style={{ ["--dx" as string]: `${prev.x - here.x}px`, ["--dy" as string]: `${prev.y - here.y}px` }}>
            <g transform={`translate(${here.x + 18} ${here.y - 30})`}>
              <path d="M0 26 L0 0 L22 7 L0 14" fill="#7a2318" stroke="#3b2a18" strokeWidth="2" strokeLinejoin="round" />
              <line x1="0" y1="0" x2="0" y2="30" stroke="#3b2a18" strokeWidth="3" />
            </g>
          </g>
        )}

        {/* compass and cartouche */}
        <g transform={`translate(${map.w - 80} ${map.h - 90})`} className="compass">
          <circle r="34" fill="none" stroke="#3b2a18" strokeWidth="1.5" />
          <path d="M0 -44 L8 0 L0 44 L-8 0 Z" fill="#3b2a18" />
          <path d="M-44 0 L0 -7 L44 0 L0 7 Z" fill="#9c8558" stroke="#3b2a18" strokeWidth="1" />
          <circle r="5" fill="#c9a24a" stroke="#3b2a18" />
          <text y="-50" textAnchor="middle" className="map-num">N</text>
        </g>
        <g transform="translate(24 22)">
          <rect width={Math.max(220, (map.title ?? adv.title).length * 15)} height="46" fill="#f7efd8" stroke="#3b2a18" strokeWidth="2" rx="3" />
          <text x="14" y="31" className="map-title">{map.title ?? adv.title}</text>
        </g>
        <rect x="6" y="6" width={map.w - 12} height={map.h - 12} fill="none" stroke="#3b2a18" strokeWidth="3" />
        <rect x="13" y="13" width={map.w - 26} height={map.h - 26} fill="none" stroke="#3b2a18" strokeWidth="1" />
      </svg>
    </div>
  );
}

/** Terrain of a stop's location (from the map, else guessed from its text). */
export function stopTerrain(adv: Adventure, locationId: string, fallbackText: string): string {
  return mapFor(adv).locations[locationId]?.terrain ?? terrainFor(fallbackText);
}

export function safePlaceTerrain(adv: Adventure, id: string, fallbackText: string): string {
  return adv.map?.safePlaces?.[id]?.terrain ?? terrainFor(fallbackText);
}
