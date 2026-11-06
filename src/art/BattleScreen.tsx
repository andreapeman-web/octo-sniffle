// Battle stage: the foe on the far platform (upper right) with its nameplate, the hero
// seen from behind on the near platform (lower left) with theirs, and a narrator box.
// Hits play short animations: lunge, flash, shake, a floating damage number and an
// HP bar that drains in steps.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StoredImg } from "../components/ui";
import { sceneUrl } from "./scenes";
import { heroPalette, spriteUrl } from "./sprites";

export interface StageEvent {
  /** Increments for every new event so the same kind can replay. */
  key: number;
  kind: "hit" | "miss" | "heal" | "levelup";
  damage?: number;
  foeFaints?: boolean;
}

export interface StageFoe {
  id: string;
  label: string;
  sub?: string; // "CR 1/4"
  hp?: number;
  maxHp?: number;
  sprite: string;
  imageId?: string; // the player's own picture, if uploaded
}

export interface StageHero {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  xpPct: number;
}

interface Props {
  terrain: string;
  foe: StageFoe | null;
  hero: StageHero;
  event: StageEvent | null;
  message: string;
  /** Extra controls in the narrator box (e.g. stat block button). */
  aside?: ReactNode;
}

const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function hpClass(v: number, max: number) {
  const r = max > 0 ? v / max : 0;
  return r > 0.5 ? "hp-high" : r > 0.2 ? "hp-mid" : "hp-low";
}

function HpBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="hpbar" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <span className="hpbar-tag">HP</span>
      <span className="hpbar-track">
        <span className={`hpbar-fill ${hpClass(value, max)}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** Narrator text that types itself out; a tap shows it all at once. */
export function TypeText({ text }: { text: string }) {
  const [n, setN] = useState(reduce() ? text.length : 0);
  useEffect(() => {
    if (reduce()) return setN(text.length);
    setN(0);
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setN(Math.min(text.length, i));
      if (i >= text.length) clearInterval(t);
    }, 28);
    return () => clearInterval(t);
  }, [text]);
  return (
    <p className="typetext" onClick={() => setN(text.length)} aria-live="polite">
      <span>{text.slice(0, n)}</span>
      <span className="typetext-rest" aria-hidden="true">{text.slice(n)}</span>
      {n >= text.length && text && <span className="typetext-caret" aria-hidden="true">▼</span>}
    </p>
  );
}

export function BattleScreen({ terrain, foe, hero, event, message, aside }: Props) {
  const [foeAnim, setFoeAnim] = useState("enter");
  const [heroAnim, setHeroAnim] = useState("enter");
  const [shake, setShake] = useState(false);
  const [shownFoeHp, setShownFoeHp] = useState(foe?.hp ?? 0);
  const [shownHeroHp, setShownHeroHp] = useState(hero.hp);
  const [dmg, setDmg] = useState<{ n: string; at: "foe" | "hero"; key: number; cls: string } | null>(null);
  const lastKey = useRef<number | null>(null);
  const foeKey = foe ? `${foe.id}:${foe.label}` : "none";

  // A new foe walks in.
  useEffect(() => {
    setFoeAnim("enter");
    setShownFoeHp(foe?.hp ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foeKey]);

  // Without an event, follow the true values directly (e.g. after loading).
  useEffect(() => {
    if (!event || event.key === lastKey.current) {
      setShownHeroHp(hero.hp);
      if (!foeAnim.includes("faint")) setShownFoeHp(foe?.hp ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.hp, foe?.hp]);

  useEffect(() => {
    if (!event || event.key === lastKey.current) return;
    lastKey.current = event.key;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, reduce() ? 0 : ms));
    if (event.kind === "hit") {
      setHeroAnim("attack");
      at(320, () => {
        setFoeAnim("hurt");
        setShownFoeHp(foe?.hp ?? 0);
        setDmg({ n: `-${event.damage ?? 0}`, at: "foe", key: event.key, cls: "dmg-out" });
      });
      at(900, () => setHeroAnim("idle"));
      if (event.foeFaints) at(1100, () => setFoeAnim("faint"));
      else at(1000, () => setFoeAnim("idle"));
    } else if (event.kind === "miss") {
      setFoeAnim("attack");
      at(320, () => {
        setHeroAnim("hurt");
        setShake(true);
        setShownHeroHp(hero.hp);
        setDmg({ n: `-${event.damage ?? 0}`, at: "hero", key: event.key, cls: "dmg-in" });
      });
      at(700, () => setShake(false));
      at(1000, () => {
        setFoeAnim("idle");
        setHeroAnim(hero.hp <= 0 ? "faint" : "idle");
      });
    } else if (event.kind === "heal") {
      setHeroAnim("heal");
      setShownHeroHp(hero.hp);
      setDmg({ n: "+1", at: "hero", key: event.key, cls: "dmg-heal" });
      at(900, () => setHeroAnim("idle"));
    } else if (event.kind === "levelup") {
      setHeroAnim("levelup");
      at(1400, () => setHeroAnim("idle"));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.key]);

  return (
    <div className={`battle ${shake ? "shake" : ""}`}>
      <div className="stage" style={{ backgroundImage: `url(${sceneUrl(terrain, true)})` }}>
        {foe && (
          <>
            <div className="plate plate-foe">
              <div className="plate-name">
                <b>{foe.label}</b>
                {foe.sub && <small>{foe.sub}</small>}
              </div>
              {foe.maxHp !== undefined && <HpBar value={shownFoeHp} max={foe.maxHp} label={`${foe.label} hit points`} />}
              {foe.maxHp !== undefined && <div className="plate-nums">{shownFoeHp}/{foe.maxHp}</div>}
            </div>
            <div key={foeKey} className={`actor actor-foe a-${foeAnim}`}>
              <StoredImg
                id={foe.imageId}
                alt={foe.label}
                className="actor-photo"
                fallback={<img src={spriteUrl(foe.sprite)} alt={foe.label} className="pixel" draggable={false} />}
              />
            </div>
          </>
        )}
        <div className={`actor actor-hero a-${heroAnim}`}>
          <img src={spriteUrl("hero", heroPalette(hero.level))} alt={hero.name} className="pixel" draggable={false} />
        </div>
        <div className="plate plate-hero">
          <div className="plate-name">
            <b>{hero.name}</b>
            <small>Lv {hero.level}</small>
          </div>
          <HpBar value={shownHeroHp} max={hero.maxHp} label="Your hit points" />
          <div className="plate-nums">{shownHeroHp}/{hero.maxHp}</div>
          <div className="xprow" title="Experience toward the next level">
            <span className="hpbar-tag xp-tag">XP</span>
            <div className="xpbar" role="meter" aria-label="Experience toward the next level" aria-valuenow={hero.xpPct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${hero.xpPct}%` }} /></div>
          </div>
        </div>
        {dmg && (
          <div key={dmg.key + dmg.at} className={`dmg ${dmg.cls} dmg-${dmg.at}`} aria-hidden="true">
            {dmg.n}
          </div>
        )}
      </div>
      <div className="narrator">
        <TypeText text={message} />
        {aside && <div className="narrator-aside">{aside}</div>}
      </div>
    </div>
  );
}
