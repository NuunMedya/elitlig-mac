// Not Defteri: Markdown benzeri metnin güvenli görünümü. HTML üretmez;
// noteCore.parseBlocks çıktısı React öğelerine çevrilir (XSS yok).
import React from "react";
import { parseBlocks } from "../../lib/noteCore";

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

export const Inline = ({ tokens = [], onWiki, hasNote }) => tokens.map((t, i) => {
  const key = i;
  if (t.type === "text") return <React.Fragment key={key}>{t.text}</React.Fragment>;
  if (t.type === "code") return <code key={key} className="nt-md__code">{t.text}</code>;
  if (t.type === "bold") return <strong key={key}><Inline tokens={t.children} onWiki={onWiki} hasNote={hasNote} /></strong>;
  if (t.type === "italic") return <em key={key}><Inline tokens={t.children} onWiki={onWiki} hasNote={hasNote} /></em>;
  if (t.type === "strike") return <s key={key}><Inline tokens={t.children} onWiki={onWiki} hasNote={hasNote} /></s>;
  if (t.type === "link") {
    if (!SAFE_HREF.test(t.href)) return <Inline key={key} tokens={t.children} />;
    return <a key={key} href={t.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Inline tokens={t.children} /></a>;
  }
  if (t.type === "wiki") {
    const exists = hasNote ? hasNote(t.title) : true;
    return (
      <button
        key={key}
        type="button"
        className={`nt-md__wiki${exists ? "" : " is-missing"}`}
        onClick={(e) => { e.stopPropagation(); onWiki?.(t.title); }}
        title={exists ? `"${t.title}" notunu aç` : `"${t.title}" adlı not yok — oluşturmak için tıklayın`}
      >
        {t.text}
      </button>
    );
  }
  return null;
});

const Blocks = ({ blocks, onWiki, hasNote, onToggleTask, readOnly }) => blocks.map((b) => {
  const key = `${b.type}-${b.line}`;
  const inline = (tokens) => <Inline tokens={tokens} onWiki={onWiki} hasNote={hasNote} />;
  if (b.type === "heading") {
    const Tag = `h${Math.min(6, b.level + 1)}`;
    return <Tag key={key} className={`nt-md__h nt-md__h${b.level}`}>{inline(b.inline)}</Tag>;
  }
  if (b.type === "paragraph") return <p key={key}>{b.lines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(l)}</React.Fragment>)}</p>;
  if (b.type === "hr") return <hr key={key} />;
  if (b.type === "code") return <pre key={key} className="nt-md__pre"><code>{b.text}</code></pre>;
  if (b.type === "quote") return <blockquote key={key}><Blocks blocks={b.children} onWiki={onWiki} hasNote={hasNote} readOnly /></blockquote>;
  if (b.type === "table") {
    return (
      <div key={key} className="nt-md__tablewrap">
        <table className="nt-md__table">
          <thead><tr>{b.header.map((cell, i) => <th key={i}>{inline(cell)}</th>)}</tr></thead>
          <tbody>{b.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i}>{inline(cell)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (b.type === "list") {
    const Tag = b.ordered ? "ol" : "ul";
    return (
      <Tag key={key} className={`nt-md__list${b.items.some((it) => it.task) ? " is-tasks" : ""}`} start={b.start}>
        {b.items.map((it) => (
          <li key={it.line} className={`${it.task ? "nt-md__task" : ""}${it.checked ? " is-done" : ""}`} style={it.depth ? { marginLeft: it.depth * 18 } : undefined}>
            {it.task && (
              <input
                type="checkbox"
                checked={it.checked}
                disabled={readOnly || !onToggleTask}
                onChange={() => onToggleTask?.(it.line)}
                onClick={(e) => e.stopPropagation()}
                aria-label={it.checked ? "İşareti kaldır" : "Tamamlandı olarak işaretle"}
              />
            )}
            <span>{inline(it.inline)}</span>
          </li>
        ))}
      </Tag>
    );
  }
  return null;
});

/** Metnin önizlemesi. onToggleTask(lineIndex): önizlemeden onay kutusu işaretleme. */
const MarkdownView = ({ text = "", onWiki, hasNote, onToggleTask, readOnly = false, empty = null, className = "" }) => {
  const blocks = parseBlocks(text);
  if (!blocks.length) return empty;
  return <div className={`nt-md ${className}`.trim()}><Blocks blocks={blocks} onWiki={onWiki} hasNote={hasNote} onToggleTask={onToggleTask} readOnly={readOnly} /></div>;
};

export default MarkdownView;
