// Original pixel-art sprites, drawn as character grids and rendered to PNG data URLs.
// Each letter is a palette colour; "." is transparent. A dark outline is added
// automatically around every shape, in the style of hand-held RPG sprites.

export const PALETTE: Record<string, string> = {
  k: "#1b1410", // near-black
  d: "#4a4a52", // dark grey
  g: "#8a8a92", // grey
  G: "#c4c4c8", // light grey
  w: "#f4f0e6", // white
  r: "#c8432e", // red
  R: "#7a2318", // dark red
  y: "#f2c84b", // yellow
  o: "#c9853f", // orange-brown
  b: "#8a5a32", // brown
  B: "#5a3a20", // dark brown
  n: "#e8b48a", // skin
  N: "#b9805a", // skin shadow
  e: "#6aa84f", // green
  E: "#3f6e2e", // dark green
  m: "#8fa37a", // grey-green (undead skin)
  M: "#5f6f4f",
  p: "#5b3f78", // purple
  P: "#38264d",
  c: "#a9c8d8", // pale blue
  u: "#3d6fb3", // blue
  U: "#26457a", // dark blue
  s: "#b9c3cc", // steel
  S: "#6f7d8a", // dark steel
  l: "#efe6cf", // bone
  L: "#bfb08c", // bone shadow
  t: "#f7e7a6", // candle light
};

const OUTLINE = "#1b1410";

export interface SpriteDef {
  rows: string[];
  palette?: Record<string, string>;
}

// ---------- monsters (facing the hero, down-left) ----------

const WOLF = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "......g...g.....................",
  ".....gGg.gGg....................",
  ".....gGgggGg....................",
  "....gggggggggg..................",
  "...ggyggggggggg.................",
  "..gggkgggggggggg...........gg...",
  ".ggggggggGggggggg.........gGg...",
  "kgggggggGGGgggggggg......gGg....",
  ".wGgggggGGGGggggggggggggggg.....",
  "..wwGgggGGGGGgggggggggggggg.....",
  "...wwGGGGGGGGggggggggggggggg....",
  ".....GGGGGGGgggggggggggggggdg...",
  "......GGGGGggggggggggggggggdgg..",
  "......GGGggggggggggggggggggddg..",
  ".......gggg..dgggggggggggggd.g..",
  ".......ggg...dggg...gggggggd....",
  ".......ggg...ggg.....ggg.ggg....",
  "......ggg....ggg.....ggg..gg....",
  "......ggg....gg.....ggg...gg....",
  ".....wwg....wwg.....wwg..wwg....",
];

const GOBLIN = [
  "................................",
  "................................",
  "................................",
  ".............eeeeee.............",
  "..ee........eeeeeeee........ee..",
  "..eEe......eeeeeeeeee......eEe..",
  "...eEe....eeeeeeeeeeee....eEe...",
  "....eEee.eeyyeeeeeyyeee.eeEe....",
  ".....eeeeeeykeeeeeykeeeeeeee....",
  ".......eeeeeeeeeeeeeeeee........",
  "........eeeeeeeEEeeeeeee........",
  "........eeewewewewewweee........",
  ".........eeeeeeeeeeeeee.........",
  "..........eeeeeeeeeeee.......s..",
  "...........BBBBBBBBBB.......ss..",
  ".........bbbbbbbbbbbbbb....ss...",
  "........bbbbbbbbbbbbbbbb..ss....",
  ".......ebbbbbbbbbbbbbbbbbsS.....",
  "......ee.bbbbbbBbbbbbbb.ee......",
  ".....ee..bbbbbbBbbbbbbb..e......",
  "....ee...bbbbbbBbbbbbbb.........",
  ".........BBBBBBBBBBBBBB.........",
  "..........bbbbb..bbbbb..........",
  "..........eeee....eeee..........",
  "..........eee......eee..........",
  ".........BBBB......BBBB.........",
];

const BUGBEAR = [
  "................................",
  "...........BBBBBBBB.............",
  ".........BBBBBBBBBBBB...........",
  "..BB....BBBooooooooBBB....BB....",
  "..BoB..BBooooooooooooBB..BoB....",
  "...BoBBBooyyooooooyyooBBBoB.....",
  "....BBBooykoooooooykooooBB......",
  ".....Boooooooo..oooooooooB......",
  ".....Boooowooooooooowoooo.......",
  "......BooowwooooooowwoooB.......",
  "......BBoooooooooooooooBB.......",
  ".....BBBBBooooooooooBBBBB.......",
  "...BBBBBBBBBBBBBBBBBBBBBBBB..ss.",
  "..BBBbbbbbbbbbbbbbbbbbbbbBBBsSs.",
  ".BBBbbbbbbbbbbbbbbbbbbbbbbbBBss.",
  ".oBBbbbbbbbbbbbbbbbbbbbbbbbBo...",
  ".oo.bbbbbbbbbbbbbbbbbbbbbbb.oo..",
  ".oo.bbbbbbbbbbbbbbbbbbbbbbb..o..",
  "oo..bbbbbbbbbbBbbbbbbbbbbbb..o..",
  "o...BBBBBBBBBBBBBBBBBBBBBBB.....",
  ".....bbbbbbbbb...bbbbbbbbb......",
  ".....BBBBBBBB.....BBBBBBBB......",
  ".....oooooooo.....oooooooo......",
  "......oooooo.......oooooo.......",
  ".....BBBBBBB......BBBBBBBB......",
];

const RAT = [
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "................................",
  "......nn..nn....................",
  ".....nNn.nNn....................",
  "....bbbbbbbbbb..................",
  "...bbkbbbbbbbbbbbbbbbb..........",
  "..bbbbbbbbbbbbbbbbbbbbbb........",
  ".nbbbbbbbbbbbbbbbbbbbbbbbb......",
  "nnwbbbbbobbbbbbbbbbbbbbbbbb.....",
  ".w..bbbooobbbbbbbbbbbbbbbbbb.nn.",
  ".....bboooobbbbbbbbbbbbbbbbbnn..",
  "......bbbbbbbbbbbbbbbbbbbbbbn...",
  ".......nn.bb.....bbb..bbnnnn....",
  "......nn..nn.....nn...nn........",
];

const SKELETON = [
  "................................",
  "..............llll..............",
  ".............llllll.............",
  "............llllllll............",
  "............lkklkkll............",
  "............lkklkkll............",
  "............llllllll............",
  ".............lwlwlwl............",
  "..............llll..............",
  "........RRRRRRRRRRRRRRRR........",
  ".......RRRRRRRRRRRRRRRRRR.......",
  "......lRRRRRRyyRRRRRRRRRRl......",
  ".....ll.RRRRRyyRRRRRRRRR.ll.....",
  "....ll..RRRRRRRRRRRRRRRR..ll....",
  "...SSS...RRRRRRRRRRRRRR....ll...",
  "..SSSSS..RRRRRRRRRRRRRR.....ll..",
  "..SSySS...LLLLLLLLLLLL......ls..",
  "..SSSSS...lL.lL.lL.lL......ss...",
  "...SSS.....llllllllll.....ss....",
  "...........ll......ll....ss.....",
  "...........ll......ll...........",
  "...........ll......ll...........",
  "...........ll......ll...........",
  "..........lll......lll..........",
  ".........llll......llll.........",
];

const ZOMBIE = [
  "................................",
  "............MMMMMMM.............",
  "...........MmmmmmmmM............",
  "...........mmmmmmmmm............",
  "...........mrmmmmrmm............",
  "...........mmmmmmmmm............",
  "...........mmMwMwMmm............",
  "............mmmmmmm.............",
  "..........UUUUUUUUUUU...........",
  ".mmmmmmmmUUUUUUUUUUUUU..........",
  ".mmmmmmmUUUUUUUUUUUUUUmmmmmmmm..",
  "........UUUUUUUUUUUUUUmmmmmmmm..",
  "........UUUUUmUUUUUUUU..........",
  "........UUUUUmmUUUUUUU..........",
  "........UUUUUUUUUUUUUU..........",
  ".........UUUUUUUUUUUUU..........",
  ".........U.UUUUUUUUU.U..........",
  "..........BBBBBBBBBBB...........",
  "..........BBBB...BBBB...........",
  "..........BBB.....BBB...........",
  "..........mmm.....mmm...........",
  "..........mmm.....mmm...........",
  ".........mmmm.....mmmm..........",
];

const SPIDER = [
  "................................",
  "................................",
  "................................",
  ".........PP..........PP.........",
  "........PP............PP........",
  ".......PP....pppppp....PP.......",
  "......PP...pppppppppp...PP......",
  ".....PP...pppppppppppp...PP.....",
  ".....P...pppppppPpppppp...P.....",
  "....PP...ppppppPPPpppppp..PP....",
  "....P....pppppppPpppppp....P....",
  "....P.....pppppppppppp.....P....",
  "...PP..PP..pppppppppp..PP..PP...",
  "...P..PP....pppppppp....PP..P...",
  "..PP..P....PPPPPPPPPP....P..PP..",
  "..P..PP...PPrrPPPPrrPP...PP..P..",
  "..P..P....PPrrPrrPrrPP....P..P..",
  ".PP..P.....PPPPPPPPPP.....P..PP.",
  ".P..PP......PwPPPPwP......PP..P.",
  ".P..P.......PwP..PwP.......P..P.",
  ".P..P........w....w........P..P.",
  "....P......................P....",
];

const GHOUL = [
  "................................",
  "................................",
  "...........ccccccc..............",
  "..........ccccccccc.............",
  ".........cccccccccccc...........",
  ".........crrcccrrccc............",
  ".........ccccccccccc............",
  "..........cwkwkwkwc.............",
  "...........ccccccc..............",
  ".........ddddddddddd............",
  ".......ddddddddddddddd..........",
  "......cdddddddddddddddc.........",
  ".....cc.ddddddddddddd.cc........",
  "....cc..ddddddddddddd..cc.......",
  "...cc...ddddddddddddd...cc......",
  "..wcw...ddddddddddddd...wcw.....",
  "..w.w....ddddddddddd....w.w.....",
  "..........ddddddddd.............",
  "..........cc.....cc.............",
  ".........ccc.....ccc............",
  ".........cc.......cc............",
  "........ccc.......ccc...........",
];

const BANDIT = [
  "................................",
  "............RRRRRRR.............",
  "...........RRRRRRRRR............",
  "..........RRRnnnnnRRR...........",
  "..........RRnknnnknRR...........",
  "..........RRnnnnnnnRR...........",
  "..........RRkkkkkkkRR...........",
  "...........RkkkkkkkR............",
  ".........BBBBBBBBBBBBB..........",
  "........BBBBBBBBBBBBBBB.........",
  ".......BBBBBBBbBBBBBBBBB........",
  "......nBBBBBBbbbBBBBBBBBn.......",
  ".....nn.BBBBByBBBBBBBBB.nn......",
  "....nn..BBBBBBBBBBBBBBB..nns....",
  "...........BBBBBBBBB......sS....",
  "...........BBBBBBBBB.......s....",
  "...........bbb...bbb............",
  "...........bbb...bbb............",
  "..........BBBB...BBBB...........",
];

const OGRE = [
  "...........MMMMMMMMM............",
  ".........MMmmmmmmmmmMM..........",
  "........MmmmmmmmmmmmmmM.........",
  "........mmyymmmmmmyymmm.........",
  "........mmykmmmmmmykmmm.........",
  "........mmmmmmmMmmmmmmm.........",
  "........mmmmmmMMMmmmmmm.........",
  "........mmwmmmmmmmmmwmm.........",
  ".........mwwwwwwwwwwwm..........",
  "......mmmmmmmmmmmmmmmmmmm.......",
  ".....mmmmmmmmmmmmmmmmmmmmmm.....",
  "....mmmmmmmmmmmmmmmmmmmmmmmm....",
  "...mmmm.mmmmmmmmmmmmmmmmm.mmm...",
  "..mmmm..mmmmmmmMmmmmmmmmm..mmm..",
  "..mmm...mmmmmmmmmmmmmmmmm...mmB.",
  "..mm....mmmmmmmmmmmmmmmmm...BBBB",
  "..mm....bbbbbbbbbbbbbbbbb..BBBBB",
  ".mmm....bbbbbbbbbbbbbbbbb..BBBB.",
  ".mm.....bbbbbbBbbbbbbbbbb..BBB..",
  "........bbbbbbBBbbbbbbbbb.BBB...",
  ".........mmmmmm...mmmmmm.BBB....",
  ".........mmmmmm...mmmmmm.BB.....",
  ".........mmmmm.....mmmmm........",
  "........mmmmmm.....mmmmmm.......",
  ".......mmmmmmm.....mmmmmmm......",
];

const SHADE = [
  "................................",
  "..............kkkk..............",
  "............dddddddd............",
  "...........dddddddddd...........",
  "..........ddyyddddyydd..........",
  "..........dddddddddddd..........",
  "..........dddddddddddd..........",
  "...........dddddddddd...........",
  ".........dddddddddddddd.........",
  "........dddddddddddddddd........",
  ".......dddddddddddddddddd.......",
  "......dd.dddddddddddddd.dd......",
  ".....dd..dddddddddddddd..dd.....",
  "..........dddddddddddd..........",
  "..........ddd.dddd.ddd..........",
  ".........ddd..dddd..ddd.........",
  "........dd....dd.d....dd........",
];

// ---------- the hero, seen from behind ----------

const HERO = [
  "................................",
  ".............rr.................",
  "............rrrr................",
  "...........rrrrr................",
  "..........sssssss...............",
  ".........sssssssss..............",
  ".........sSssssssS.........s....",
  ".........sSSSSSSSS........ss....",
  ".........sssssssss.......ss.....",
  "..........sssssss.......ss......",
  "......CCCCCCCCCCCCCC...ss.......",
  ".....CCCCCCCCCCCCCCCCyyy........",
  "....uuuuuCCCCCCCCCCCCCnn........",
  "...uuuuuuuCCCCCCCCCCCCCnn.......",
  "...uuyyuuuCCCCCCCCCCCCCC........",
  "...uyyyyuuCCCCCCCCCCCCCC........",
  "...uuyyuuuCCCCCCCCCCCCCC........",
  "...uuuuuuuCCCCCCCCCCCCCC........",
  "....uuuuuCCCCCCCCCCCCCCCC.......",
  "......CCCCCCCCCCCCCCCCCCC.......",
  ".....CCCCCCCCCCCCCCCCCCCCC......",
  ".....CCCCCCCCCCCCCCCCCCCCC......",
  ".......AAAAAA.....AAAAAA........",
  ".......AAAAAA.....AAAAAA........",
  "......BBBBBBB.....BBBBBBB.......",
];

/** Armour tiers by level: leather, mail, plate, gilded. C = cape/tabard, A = legs. */
export function heroPalette(level: number): Record<string, string> {
  if (level >= 11) return { C: "#7a2318", A: "#c9a24a", s: "#f2d27a", S: "#b38a2e", u: "#7a2318", y: "#f2c84b" };
  if (level >= 7) return { C: "#26457a", A: "#b9c3cc", s: "#d8dee4", S: "#8a97a3", u: "#c8432e", y: "#f4f0e6" };
  if (level >= 4) return { C: "#7a2318", A: "#6f7d8a", s: "#b9c3cc", S: "#6f7d8a", u: "#3d6fb3", y: "#f2c84b" };
  return { C: "#3f6e2e", A: "#5a3a20", s: "#a89a80", S: "#6f604a", u: "#8a5a32", y: "#e8b48a" };
}

const TOME = [
  "................................",
  "................................",
  "................................",
  "..............t.................",
  ".............tyt................",
  ".............tyt................",
  "..............w.................",
  "..............w.................",
  ".............www................",
  "................................",
  "...RRRRRRRRRRR...RRRRRRRRRRR....",
  "...RwwwwwwwwwwR.RwwwwwwwwwwR....",
  "...RwGGGGGGGwwR.RwwGGGGGGGwR....",
  "...RwwwwwwwwwwRRRwwwwwwwwwwR....",
  "...RwGGGGGGwwwRRRwwGGGGGGGwR....",
  "...RwwwwwwwwwwRRRwwwwwwwwwwR....",
  "...RwGGGGGGGwwRRRwwGGGGGwwwR....",
  "...RwwwwwwwwwwRRRwwwwwwwwwwR....",
  "...RRRRRRRRRRRRRRRRRRRRRRRRR....",
  "....RRRRRRRRRRRRRRRRRRRRRRR.....",
];

export const SPRITES: Record<string, string[]> = {
  wolf: WOLF,
  goblin: GOBLIN,
  bugbear: BUGBEAR,
  rat: RAT,
  skeleton: SKELETON,
  zombie: ZOMBIE,
  spider: SPIDER,
  ghoul: GHOUL,
  bandit: BANDIT,
  ogre: OGRE,
  shade: SHADE,
  hero: HERO,
  tome: TOME,
};

/** Pick a sprite for a monster from its explicit `sprite` field or its name. */
export function spriteFor(name: string, explicit?: string): string {
  if (explicit && SPRITES[explicit]) return explicit;
  const n = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/wolf|dog|hound|jackal|worg/, "wolf"],
    [/goblin|kobold|imp/, "goblin"],
    [/bugbear|hobgoblin|gnoll|orc|bear/, "bugbear"],
    [/rat|weasel|badger/, "rat"],
    [/skeleton|bone/, "skeleton"],
    [/zombie|corpse/, "zombie"],
    [/spider|scorpion|insect|beetle/, "spider"],
    [/ghoul|ghast|wight|vampire/, "ghoul"],
    [/bandit|thug|cultist|guard|brigand|pirate|assassin|mage|priest/, "bandit"],
    [/ogre|troll|giant|ettin/, "ogre"],
  ];
  for (const [re, s] of rules) if (re.test(n)) return s;
  return "shade";
}

const cache = new Map<string, string>();

/** Render a sprite to a PNG data URL (cached). */
export function spriteUrl(key: string, palette: Record<string, string> = {}): string {
  const id = key + JSON.stringify(palette);
  const hit = cache.get(id);
  if (hit) return hit;
  const rows = SPRITES[key] ?? SPRITES.shade;
  const W = 32;
  const H = 32;
  const top = H - rows.length; // align sprites to the bottom (they stand on the ground)
  const pal = { ...PALETTE, ...palette };
  const grid: (string | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (ch && ch !== "." && pal[ch]) grid[y + top][x] = pal[ch];
    }
  });
  // 34x34 canvas: one pixel of room for the outline on every side.
  const c = document.createElement("canvas");
  c.width = W + 2;
  c.height = H + 2;
  const ctx = c.getContext("2d")!;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== null;
  ctx.fillStyle = OUTLINE;
  for (let y = -1; y <= H; y++) {
    for (let x = -1; x <= W; x++) {
      if (filled(x, y)) continue;
      if (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const col = grid[y][x];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  const url = c.toDataURL("image/png");
  cache.set(id, url);
  return url;
}
