import { useRef, useState } from "react";
import { useApp } from "../App";
import { storeImage, forgetImageUrl } from "../lib/images";
import type { Monster } from "../lib/types";
import { Modal, Placeholder, StoredImg } from "./ui";

export const assetId = (advId: string, kind: "monster" | "location", id: string) => `asset:${advId}:${kind}:${id}`;

/** Adventure art with a placeholder and an optional "replace with my own file" button. */
export function AssetImage({ kind, id, label, icon, editable }: { kind: "monster" | "location"; id: string; label: string; icon?: string; editable?: boolean }) {
  const { adventure } = useApp();
  const [v, setV] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  if (!adventure) return null;
  const aid = assetId(adventure.id, kind, id);
  return (
    <div className={`asset asset-${kind}`}>
      <StoredImg key={v} id={aid} alt={label} className={`asset-img`} fallback={<Placeholder kind={kind} label={label} icon={icon} />} />
      {editable && (
        <>
          <button className="asset-edit" onClick={() => ref.current?.click()} aria-label={`Replace image for ${label}`}>🖼</button>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              forgetImageUrl(aid);
              await storeImage(aid, f, "asset", 1200);
              setV((x) => x + 1);
            }}
          />
        </>
      )}
    </div>
  );
}

export function StatBlock({ monster, onClose }: { monster: Monster; onClose: () => void }) {
  const { run, setRun, adventure } = useApp();
  const base = adventure?.monsters[monster.id];
  const [hp, setHp] = useState(monster.hp);
  const [dmg, setDmg] = useState(monster.hitDamage);
  const [xp, setXp] = useState(monster.xp);
  const changed = hp !== monster.hp || dmg !== monster.hitDamage || xp !== monster.xp;

  const save = async () => {
    if (!run) return;
    const r = structuredClone(run);
    r.monsterOverrides[monster.id] = { ...(r.monsterOverrides[monster.id] ?? {}), hp, hitDamage: dmg, xp };
    if (r.phase === "combat") r.foeHp = Math.min(r.foeHp, hp);
    await setRun(r);
    onClose();
  };
  const reset = async () => {
    if (!run) return;
    const r = structuredClone(run);
    delete r.monsterOverrides[monster.id];
    await setRun(r);
    onClose();
  };

  return (
    <Modal title={monster.name} onClose={onClose}>
      <div className="statblock">
        {monster.description && <p><em>{monster.description}</em></p>}
        <p>
          <b>Armour Class</b> {monster.ac ?? "—"} · <b>Challenge</b> {monster.cr ?? "—"}
        </p>
        <h4>Attacks</h4>
        <ul>
          {monster.attacks.map((a) => (
            <li key={a.name}>
              <b>{a.name}.</b> {a.text ?? `${a.damage} damage`}
            </li>
          ))}
        </ul>
        <div className="grid3">
          <label className="field"><span>Hit points</span><input type="number" min={1} value={hp} onChange={(e) => setHp(Math.max(1, +e.target.value))} /></label>
          <label className="field"><span>Damage per hit</span><input type="number" min={0} value={dmg} onChange={(e) => setDmg(Math.max(0, +e.target.value))} /></label>
          <label className="field"><span>XP</span><input type="number" min={0} value={xp} onChange={(e) => setXp(Math.max(0, +e.target.value))} /></label>
        </div>
        <p className="muted small">Source: {monster.source}{run?.monsterOverrides[monster.id] ? " (edited by you)" : ""}</p>
        <p className="muted small">Damage per hit is the fixed average of its attack, multiplied by your difficulty setting.</p>
        <div className="row">
          <button className="btn primary" disabled={!changed} onClick={save}>Save changes</button>
          {run?.monsterOverrides[monster.id] && base && <button className="btn" onClick={reset}>Restore original</button>}
        </div>
      </div>
    </Modal>
  );
}

export function TopicPicker({ onClose }: { onClose: () => void }) {
  const { upload, settings, updateSettings } = useApp();
  const all = upload?.tags ?? [];
  const [sel, setSel] = useState<string[]>(settings.selectedTags ?? all);
  const toggle = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  return (
    <Modal title="Topics for the next fights" onClose={onClose}>
      {all.length === 0 && <p>No questions uploaded yet.</p>}
      <div className="row">
        <button className="btn small" onClick={() => setSel(all)}>All</button>
        <button className="btn small" onClick={() => setSel([])}>None</button>
      </div>
      <div className="tag-list">
        {all.map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={sel.includes(t)} onChange={() => toggle(t)} /> {t}
          </label>
        ))}
      </div>
      <button
        className="btn primary wide"
        disabled={all.length > 0 && sel.length === 0}
        onClick={async () => {
          await updateSettings({ selectedTags: sel.length === all.length ? null : sel });
          onClose();
        }}
      >
        Use {sel.length === all.length ? "all topics" : `${sel.length} topic${sel.length === 1 ? "" : "s"}`}
      </button>
    </Modal>
  );
}
