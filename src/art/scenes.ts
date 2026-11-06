// Pixel-art scene backdrops, painted on a 160x96 canvas and scaled up without smoothing.
// Each terrain is a small recipe of layers. `battle` adds the two ground platforms.

export type Terrain =
  | "night-road"
  | "village"
  | "ford"
  | "marsh"
  | "crypt"
  | "tower"
  | "undercroft"
  | "shore"
  | "cave"
  | "temple"
  | "inn"
  | "shrine"
  | "field";

export const TERRAINS: Terrain[] = ["night-road", "village", "ford", "marsh", "crypt", "tower", "undercroft", "shore", "cave", "temple", "inn", "shrine", "field"];

const W = 160;
const H = 96;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function px(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Banded sky with a dithered seam between colours. */
function sky(c: Ctx, cols: string[], to = H) {
  const band = to / cols.length;
  cols.forEach((col, i) => {
    px(c, 0, i * band, W, band + 1, col);
    if (i > 0) for (let x = 0; x < W; x += 2) px(c, x + ((i % 2) as number), i * band, 1, 1, cols[i - 1]);
  });
}

function stars(c: Ctx, r: () => number, n: number, maxY: number) {
  for (let i = 0; i < n; i++) px(c, r() * W, r() * maxY, 1, 1, r() > 0.7 ? "#fff6c8" : "#9fb0d8");
}

function moon(c: Ctx, x: number, y: number) {
  c.fillStyle = "#f3eccb";
  c.beginPath();
  c.arc(x, y, 6, 0, Math.PI * 2);
  c.fill();
  px(c, x - 2, y - 2, 2, 2, "#d8cfa8");
  px(c, x + 2, y + 1, 1, 1, "#d8cfa8");
}

function hills(c: Ctx, r: () => number, base: number, amp: number, col: string) {
  c.fillStyle = col;
  let y = base;
  for (let x = 0; x < W; x++) {
    y += (r() - 0.5) * 2;
    y = Math.max(base - amp, Math.min(base + amp, y));
    c.fillRect(x, Math.round(y), 1, H);
  }
}

function pine(c: Ctx, x: number, base: number, h: number, col: string) {
  for (let i = 0; i < h; i++) {
    const w = Math.max(1, Math.round((i / h) * (h * 0.55)));
    px(c, x - w / 2, base - h + i, w, 1, col);
  }
  px(c, x - 1, base, 2, 3, "#2b1d12");
}

function house(c: Ctx, x: number, base: number, w: number, h: number, wall: string, roof: string, lit: boolean) {
  px(c, x, base - h, w, h, wall);
  for (let i = 0; i < w / 2 + 2; i++) px(c, x - 2 + i, base - h - i * 0.6 - 1, w + 4 - i * 2, 1, roof);
  px(c, x + w / 2 - 1, base - 5, 3, 5, "#2b1d12");
  if (lit) px(c, x + 2, base - h + 3, 2, 2, "#f7d36b");
}

function bricks(c: Ctx, top: number, bottom: number, base: string, mortar: string) {
  px(c, 0, top, W, bottom - top, base);
  for (let y = top; y < bottom; y += 5) {
    px(c, 0, y, W, 1, mortar);
    for (let x = (y / 5) % 2 ? 0 : 5; x < W; x += 10) px(c, x, y, 1, 5, mortar);
  }
}

function arch(c: Ctx, x: number, base: number, w: number, h: number, col: string) {
  px(c, x, base - h + w / 2, w, h - w / 2, col);
  c.fillStyle = col;
  c.beginPath();
  c.arc(x + w / 2, base - h + w / 2, w / 2, Math.PI, 0);
  c.fill();
}

function water(c: Ctx, r: () => number, top: number, bottom: number, col: string, hi: string) {
  px(c, 0, top, W, bottom - top, col);
  for (let i = 0; i < 40; i++) px(c, r() * W, top + 1 + r() * (bottom - top - 2), 3 + r() * 5, 1, hi);
}

function reeds(c: Ctx, r: () => number, base: number, n: number, col: string) {
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const h = 4 + r() * 8;
    px(c, x, base - h, 1, h, col);
    if (r() > 0.6) px(c, x - 1, base - h, 3, 2, "#6b4a2a");
  }
}

function candle(c: Ctx, x: number, base: number) {
  px(c, x, base - 5, 2, 5, "#efe6cf");
  px(c, x, base - 8, 2, 3, "#f7d36b");
  px(c, x - 1, base - 7, 4, 1, "rgba(247,211,107,0.5)");
}

function web(c: Ctx, cx: number, cy: number, rad: number) {
  c.strokeStyle = "rgba(230,230,230,0.55)";
  c.lineWidth = 1;
  for (let a = 0; a < 8; a++) {
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos((a / 8) * Math.PI * 2) * rad, cy + Math.sin((a / 8) * Math.PI * 2) * rad);
    c.stroke();
  }
  for (let k = 1; k <= 3; k++) {
    c.beginPath();
    c.arc(cx, cy, (rad * k) / 3, 0, Math.PI * 2);
    c.stroke();
  }
}

function glow(c: Ctx, x: number, y: number, rad: number, col: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, col);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function ground(c: Ctx, top: number, col: string, speck: string, r: () => number) {
  px(c, 0, top, W, H - top, col);
  for (let i = 0; i < 120; i++) px(c, r() * W, top + r() * (H - top), 1, 1, speck);
}

/** Two oval platforms: the foe's (upper right) and the hero's (lower left). */
function platforms(c: Ctx, col: string, edge: string) {
  const oval = (x: number, y: number, rx: number, ry: number) => {
    c.fillStyle = edge;
    c.beginPath();
    c.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  oval(118, 58, 30, 6);
  oval(42, 90, 36, 7);
}

const RECIPES: Record<Terrain, (c: Ctx, r: () => number) => { plat: string; edge: string }> = {
  "night-road": (c, r) => {
    sky(c, ["#0f1630", "#18234a", "#24315e", "#2f3d6b"], 60);
    stars(c, r, 50, 40);
    moon(c, 132, 14);
    hills(c, r, 46, 4, "#1d2a44");
    for (let i = 0; i < 16; i++) pine(c, 4 + i * 10 + r() * 4, 54 + r() * 3, 12 + r() * 10, "#14223a");
    // burnt mill and its wheel
    px(c, 18, 30, 14, 22, "#161b2b");
    c.strokeStyle = "#161b2b";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(36, 44, 8, 0, Math.PI * 2);
    c.stroke();
    ground(c, 56, "#3a3a32", "#4c4a3c", r);
    px(c, 0, 70, W, 8, "#5a4c36");
    return { plat: "#4c4a3c", edge: "#2b2a22" };
  },
  village: (c, r) => {
    sky(c, ["#3b2f56", "#6b4a6e", "#b9705a", "#e3a35f"], 56);
    hills(c, r, 44, 3, "#4a3b4a");
    for (let i = 0; i < 6; i++) house(c, 8 + i * 26 + r() * 6, 54, 14 + r() * 6, 9 + r() * 5, "#6b5a4a", "#4a2e2a", r() > 0.4);
    for (let x = 0; x < W; x += 4) px(c, x, 44 + (x % 8 ? 1 : 0), 3, 14, "#5a3a20");
    px(c, 70, 40, 20, 18, "#2b1d12");
    ground(c, 58, "#6b5a3e", "#7d6a4a", r);
    return { plat: "#7d6a4a", edge: "#4a3e2a" };
  },
  ford: (c, r) => {
    sky(c, ["#7fa6c9", "#9fbfd8", "#c3d8e6"], 50);
    hills(c, r, 40, 4, "#6f8f5a");
    for (let i = 0; i < 10; i++) pine(c, r() * W, 46, 10 + r() * 6, "#3f6e2e");
    px(c, 120, 30, 2, 12, "#8a8a92");
    for (let i = 0; i < 6; i++) px(c, 118 + r() * 6, 20 + i * 2, 3, 2, "rgba(220,220,220,0.6)");
    ground(c, 48, "#5f8a45", "#4f7a3a", r);
    water(c, r, 64, 74, "#3d6fb3", "#a9c8d8");
    reeds(c, r, 64, 30, "#3f6e2e");
    return { plat: "#7d8a52", edge: "#4f5a32" };
  },
  marsh: (c, r) => {
    sky(c, ["#4f5f4f", "#6f7f66", "#8f9f80"], 54);
    hills(c, r, 44, 2, "#56664f");
    for (let i = 0; i < 8; i++) px(c, r() * W, 38 + r() * 8, 1, 10, "#3f4a38");
    ground(c, 52, "#4a5a3a", "#3f4a30", r);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = "#2f4a4a";
      c.beginPath();
      c.ellipse(r() * W, 60 + r() * 30, 12 + r() * 12, 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    reeds(c, r, 62, 40, "#5f6f3a");
    px(c, 0, 76, W, 3, "#6b4a2a");
    for (let i = 0; i < 4; i++) glow(c, 20 + r() * 120, 30 + r() * 20, 6, "rgba(190,255,170,0.45)");
    c.fillStyle = "rgba(220,230,210,0.25)";
    c.fillRect(0, 48, W, 10);
    return { plat: "#5a6a42", edge: "#36402a" };
  },
  crypt: (c, r) => {
    bricks(c, 0, 66, "#3f3f48", "#2b2b33");
    for (let i = 0; i < 4; i++) arch(c, 8 + i * 40, 62, 18, 36, "#17171d");
    for (let i = 0; i < 4; i++) candle(c, 30 + i * 40, 50);
    for (let i = 0; i < 4; i++) glow(c, 31 + i * 40, 42, 10, "rgba(247,211,107,0.35)");
    water(c, r, 66, H, "#1f2a3a", "#4a5a7a");
    return { plat: "#4a4a55", edge: "#2b2b33" };
  },
  tower: (c, r) => {
    px(c, 0, 0, W, H, "#2a2420");
    for (let x = 0; x < W; x += 20) px(c, x, 0, 4, 70, "#3d2f24");
    for (let y = 8; y < 60; y += 18) px(c, 0, y, W, 3, "#3d2f24");
    c.fillStyle = "#8a6a2a";
    c.beginPath();
    c.moveTo(70, 8);
    c.lineTo(90, 8);
    c.lineTo(96, 30);
    c.lineTo(64, 30);
    c.fill();
    web(c, 80, 20, 22);
    web(c, 18, 12, 14);
    web(c, 145, 40, 16);
    ground(c, 66, "#4a3a2a", "#3a2c20", r);
    return { plat: "#5a4632", edge: "#2f241a" };
  },
  undercroft: (c, r) => {
    px(c, 0, 0, W, H, "#141218");
    for (let i = 0; i < 5; i++) {
      px(c, 10 + i * 34, 10, 8, 60, "#2b2733");
      px(c, 8 + i * 34, 8, 12, 4, "#3a3542");
    }
    for (let i = 0; i < 6; i++) candle(c, 26 + i * 24, 66);
    for (let i = 0; i < 6; i++) glow(c, 27 + i * 24, 58, 8, "rgba(247,211,107,0.3)");
    ground(c, 68, "#2b2733", "#3a3542", r);
    return { plat: "#3a3542", edge: "#1d1a24" };
  },
  shore: (c, r) => {
    sky(c, ["#2b2340", "#4a3354", "#7a4a5a", "#a8665a"], 50);
    hills(c, r, 36, 5, "#2a2232");
    hills(c, r, 44, 3, "#1f1a28");
    water(c, r, 48, 72, "#141824", "#3a4a6a");
    px(c, 60, 58, 18, 3, "#4a2e1a");
    px(c, 62, 56, 14, 2, "#5a3a20");
    ground(c, 72, "#3a3428", "#4a4232", r);
    return { plat: "#4a4232", edge: "#2a2418" };
  },
  cave: (c, r) => {
    px(c, 0, 0, W, H, "#1a1612");
    for (let i = 0; i < 22; i++) {
      const x = r() * W;
      const h = 6 + r() * 18;
      c.fillStyle = "#2b241c";
      c.beginPath();
      c.moveTo(x - 4, 0);
      c.lineTo(x + 4, 0);
      c.lineTo(x, h);
      c.fill();
    }
    for (let y = 0; y < 66; y += 2) px(c, 6 + (y % 4), y, 10, 2, y % 4 ? "#a9c8d8" : "#7fa6c9");
    glow(c, 118, 26, 30, "rgba(247,200,90,0.55)");
    px(c, 116, 10, 4, 10, "#2b1d12");
    px(c, 113, 20, 10, 9, "#c9a24a");
    px(c, 115, 22, 6, 5, "#fff2a8");
    ground(c, 66, "#3a3022", "#4a3e2c", r);
    for (let i = 0; i < 12; i++) px(c, 90 + r() * 60, 64 + r() * 4, 2, 1, "#f2c84b");
    return { plat: "#4a3e2c", edge: "#2a2216" };
  },
  temple: (c, r) => {
    bricks(c, 0, 70, "#5a5048", "#463e38");
    arch(c, 68, 56, 24, 44, "#3d6fb3");
    for (let y = 18; y < 56; y += 6) px(c, 68, y, 24, 1, "#26457a");
    px(c, 79, 14, 2, 42, "#26457a");
    glow(c, 80, 34, 30, "rgba(169,200,216,0.35)");
    for (let i = 0; i < 5; i++) candle(c, 20 + i * 30 + (i > 1 ? 14 : 0), 64);
    ground(c, 70, "#6b5a4a", "#5a4a3c", r);
    for (let i = 0; i < 3; i++) px(c, 14 + i * 50, 76, 26, 6, "#8a6a4a");
    return { plat: "#7d6a58", edge: "#4a3e32" };
  },
  inn: (c, r) => {
    px(c, 0, 0, W, 70, "#4a3020");
    for (let x = 0; x < W; x += 12) px(c, x, 0, 1, 70, "#3a2418");
    px(c, 0, 10, W, 4, "#2b1d12");
    px(c, 100, 30, 40, 36, "#5a5048");
    px(c, 108, 42, 24, 24, "#1b1410");
    for (let i = 0; i < 8; i++) px(c, 112 + r() * 14, 52 + r() * 12, 3, 4, r() > 0.5 ? "#f2a33b" : "#f7d36b");
    glow(c, 120, 56, 26, "rgba(247,160,60,0.5)");
    ground(c, 70, "#5a3a20", "#4a2e18", r);
    px(c, 10, 60, 40, 4, "#8a5a32");
    px(c, 14, 64, 3, 8, "#5a3a20");
    px(c, 44, 64, 3, 8, "#5a3a20");
    candle(c, 28, 60);
    return { plat: "#6b4a2a", edge: "#3a2418" };
  },
  shrine: (c, r) => {
    sky(c, ["#6f8fa8", "#8fafc0", "#b8cfd8"], 50);
    hills(c, r, 42, 4, "#5f7f52");
    for (let i = 0; i < 12; i++) pine(c, r() * W, 48, 10 + r() * 8, "#3f6e2e");
    px(c, 70, 26, 20, 24, "#7f8a7a");
    px(c, 66, 22, 28, 5, "#5f6a5a");
    px(c, 76, 34, 8, 16, "#3a443a");
    for (let i = 0; i < 20; i++) px(c, 66 + r() * 28, 22 + r() * 28, 2, 1, "#6aa84f");
    ground(c, 50, "#5f8a45", "#4f7a3a", r);
    water(c, r, 60, 66, "#3d6fb3", "#c3d8e6");
    return { plat: "#7d8a52", edge: "#4f5a32" };
  },
  field: (c, r) => {
    sky(c, ["#8fb0d0", "#b0c8dc", "#d0e0e8"], 50);
    hills(c, r, 42, 5, "#7a9a5a");
    ground(c, 50, "#6a9a4a", "#5a8a3e", r);
    return { plat: "#8aaa62", edge: "#5a7a3a" };
  },
};

const cache = new Map<string, string>();

/** A scene as a PNG data URL. `battle` adds the combat platforms. */
export function sceneUrl(terrain: Terrain | string | undefined, battle = false, seed = 7): string {
  const t: Terrain = (TERRAINS as string[]).includes(terrain ?? "") ? (terrain as Terrain) : "field";
  const key = `${t}:${battle}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const r = rng(seed * 7919 + t.length * 31);
  const { plat, edge } = RECIPES[t](c, r);
  if (battle) platforms(c, plat, edge);
  const url = cv.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** Guess a terrain from a place name/description (for imported adventures). */
export function terrainFor(text: string): Terrain {
  const s = text.toLowerCase();
  const rules: [RegExp, Terrain][] = [
    [/temple|church|chapel(?!.*crypt)|abbey|shrine of/, "temple"],
    [/inn|tavern|hall/, "inn"],
    [/crypt|tomb|catacomb|grave/, "crypt"],
    [/tower|belfry|attic|loft/, "tower"],
    [/vault|undercroft|cellar|dungeon|sewer/, "undercroft"],
    [/cave|cavern|mine|lair|grotto/, "cave"],
    [/marsh|swamp|bog|fen|causeway/, "marsh"],
    [/ford|river|stream|bridge/, "ford"],
    [/lake|tarn|shore|coast|beach|harbou?r|port|sea/, "shore"],
    [/village|town|gate|city|market|street/, "village"],
    [/road|forest|wood|path|trail|night/, "night-road"],
    [/shrine|spring|grove/, "shrine"],
  ];
  for (const [re, t] of rules) if (re.test(s)) return t;
  return "field";
}
