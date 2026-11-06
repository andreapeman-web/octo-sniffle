import { useEffect, useState, type ReactNode } from "react";
import { imageUrl } from "../lib/images";

/**
 * Safe rich text for questions and explanations: paragraphs, line breaks, **bold**, *italic*
 * and Markdown pipe tables. Text is shown exactly as written — no number or unit formatting.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length}>
          {para.map((l, j) => (
            <span key={j}>
              {inline(l)}
              {j < para.length - 1 && <br />}
            </span>
          ))}
        </p>,
      );
      para = [];
    }
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div className="table-wrap" key={blocks.length}>
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (l.trim() === "") flush();
    else para.push(l);
    i++;
  }
  flush();
  return <div className={`rich ${className ?? ""}`}>{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={m.index}>{t.slice(2, -2)}</strong> : <em key={m.index}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Image from the device store, loaded only when rendered. */
export function StoredImg({ id, url, alt, className, fallback }: { id?: string; url?: string; alt: string; className?: string; fallback?: ReactNode }) {
  const [src, setSrc] = useState<string | undefined>(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    if (id) imageUrl(id).then((u) => live && (u ? setSrc(u) : setFailed(true)));
    else setSrc(url);
    return () => {
      live = false;
    };
  }, [id, url]);
  if ((!id && !url) || failed) return <>{fallback ?? null}</>;
  if (!src) return <div className={`img-loading ${className ?? ""}`} />;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

export function Bar({ value, max, kind, label }: { value: number; max: number; kind: "hp" | "foe" | "xp"; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bar bar-${kind}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label ?? kind}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      <span className="bar-text">{label ?? `${value} / ${max}`}</span>
    </div>
  );
}

/** Placeholder art: never blocks when an image is missing. */
export function Placeholder({ icon, label, kind = "monster" }: { icon?: string; label: string; kind?: "monster" | "location" | "portrait" }) {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div className={`placeholder ph-${kind}`} style={{ ["--hue" as string]: h }} aria-label={label} role="img">
      <span>{icon ?? label.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Back">←</button> : <span className="icon-spacer" />}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
