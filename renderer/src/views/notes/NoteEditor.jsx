// Not Defteri (masaüstü): düzenleyici. Web'deki düzenleyiciyle aynı özellikler:
// Markdown benzeri yazım + önizleme (Yaz / Yan yana / Önizleme), biçim çubuğu,
// ⌘ kısayolları, "/" komut menüsü, [[Not adı]] tamamlama, otomatik kayıt,
// kelime sayacı, odak modu, geri bağlantılar, proje / kişi bağlantıları.
// Çevrimdışı yazılanlar kuyruğa alınır (app/api.js QUEUEABLE).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, MenuButton, Segmented } from "../../components/ui";
import { patch } from "../../api";
import { relativeTime } from "../../lib/helpers";
import MarkdownView from "./MarkdownView";
import {
  applyFormat, backlinks, checklistToBody, continueList, filterSlash, findByTitle, indentLines, lowerTr, notebookTree,
  runSlash, slashContext, textStats, toggleTaskLine, wikiContext, wikiLinks,
} from "../../lib/noteCore";

export const COLORS = ["", "#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#fed7aa", "#e5e7eb"];
const EMOJIS = ["📝", "📌", "💡", "🗓️", "⚽", "🏟️", "🏆", "📣", "📔", "✅", "📋", "📎", "💰", "🧾", "📊", "🎯", "🚀", "🔥", "⭐", "❤️", "🤝", "📷", "🎥", "🧠"];
const MODE_KEY = "notes:mode";
const readMode = () => { try { return localStorage.getItem(MODE_KEY) || "write"; } catch { return "write"; } };

const FORMAT_BUTTONS = [
  { kind: "bold", icon: "bold", label: "Kalın", keys: "⌘B" },
  { kind: "italic", icon: "italic", label: "İtalik", keys: "⌘I" },
  { kind: "strike", text: "S̶", label: "Üstü çizili", keys: "⇧⌘X" },
  { kind: "code", text: "</>", label: "Kod", keys: "⌘E" },
  "|",
  { kind: "h1", text: "B1", label: "Başlık 1", keys: "⌥⌘1" },
  { kind: "h2", text: "B2", label: "Başlık 2", keys: "⌥⌘2" },
  { kind: "h3", text: "B3", label: "Başlık 3", keys: "⌥⌘3" },
  "|",
  { kind: "bullet", icon: "list", label: "Madde listesi", keys: "⇧⌘8" },
  { kind: "number", text: "1.", label: "Numaralı liste", keys: "⇧⌘7" },
  { kind: "task", icon: "checkSquare", label: "Yapılacak maddesi", keys: "⇧⌘9" },
  { kind: "quote", text: "❝", label: "Alıntı", keys: "⇧⌘." },
  "|",
  { kind: "link", icon: "link", label: "Bağlantı", keys: "⌘K" },
  { kind: "wiki", text: "[[ ]]", label: "Not bağlantısı", keys: "⇧⌘K" },
];
const SHORTCUTS = {
  b: "bold", i: "italic", e: "code", k: "link",
  "shift+x": "strike", "shift+k": "wiki", "shift+8": "bullet", "shift+*": "bullet", "shift+7": "number", "shift+/": "number",
  "shift+9": "task", "shift+(": "task", "shift+.": "quote", "shift+:": "quote", "alt+1": "h1", "alt+2": "h2", "alt+3": "h3",
};
const shortcutOf = (e) => {
  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = e.code?.startsWith("Digit") && e.altKey ? e.code.slice(5) : e.key.toLowerCase();
  return SHORTCUTS[`${e.shiftKey ? "shift+" : ""}${e.altKey ? "alt+" : ""}${key}`] || null;
};
const editableKeys = ["kind", "title", "body", "checklist", "tags", "color", "emoji", "notebook_id", "pinned", "project_id", "contact_ids"];
const SLASH_ICONS = { heading: "bold", check: "checkSquare", list: "list", listOl: "list", quote: "message", code: "file", table: "grid", minus: "x", calendar: "calendar", clock: "clock", link: "link" };

/** Metin kutusunda imlecin piksel konumu (yansı öğe). */
function caretCoords(textarea, position) {
  if (!textarea) return { top: 0, left: 0, height: 20 };
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  ["boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "wordSpacing", "tabSize"].forEach((p) => { mirror.style[p] = style[p]; });
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", wordWrap: "break-word", overflow: "hidden", top: "0", left: "-9999px" });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || 22;
  const out = { top: marker.offsetTop - textarea.scrollTop, left: marker.offsetLeft - textarea.scrollLeft, height: lineHeight };
  document.body.removeChild(mirror);
  return out;
}

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <span className="nt-emoji" ref={ref}>
      <button type="button" className={`nt-emoji__btn${value ? " has-value" : ""}`} onClick={() => setOpen((v) => !v)} aria-label="Kapak simgesi" title="Kapak simgesi">{value || <Icon name="smile" size={18} />}</button>
      {open && (
        <div className="nt-emoji__pop" role="listbox" aria-label="Kapak simgesi">
          {EMOJIS.map((e) => <button key={e} type="button" role="option" aria-selected={value === e} className={value === e ? "is-on" : ""} onClick={() => { onChange(e); setOpen(false); }}>{e}</button>)}
          {value && <button type="button" className="nt-emoji__clear" onClick={() => { onChange(null); setOpen(false); }}>Kaldır</button>}
        </div>
      )}
    </span>
  );
}

function ChecklistEditor({ items, onChange, readOnly }) {
  const [text, setText] = useState("");
  return (
    <div className="nt-check">
      {items.map((item, i) => (
        <div key={i} className={`nt-check__row${item.done ? " is-done" : ""}`}>
          <input type="checkbox" checked={item.done} disabled={readOnly} onChange={() => onChange(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} aria-label={`${item.text} tamamlandı`} />
          <input className="nt-check__text" value={item.text} readOnly={readOnly} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label="Madde" />
          {!readOnly && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Maddeyi sil"><Icon name="x" size={12} /></button>}
        </div>
      ))}
      {!readOnly && (
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onChange([...items, { text: text.trim(), done: false }]); setText(""); }}>
          <Icon name="plus" size={14} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Madde ekle ve ↩" aria-label="Yeni madde" />
        </form>
      )}
    </div>
  );
}

export default function NoteEditor({ note, notes = [], notebooks = [], projects = [], contacts = [], tagSuggestions = [], onSaved, onOpenTitle, onAction, go, focus, onToggleFocus, autoFocus }) {
  const readOnly = note.access === "viewer" || Boolean(note.deleted_at);
  const owner = (note.access || "owner") === "owner";
  const shared = !owner || note.share_count > 0;
  const [draft, setDraft] = useState(() => ({ ...note }));
  const [state, setState] = useState("saved");
  const [savedAt, setSavedAt] = useState(null);
  const [mode, setModeState] = useState(() => (readOnly ? "preview" : readMode()));
  const [popup, setPopup] = useState(null);
  const [tagInput, setTagInput] = useState("");
  const ref = useRef(null);
  const titleRef = useRef(null);
  const timer = useRef(null);
  const pending = useRef({});
  const latest = useRef(draft);
  const version = useRef(note.version || 1);
  latest.current = draft;
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* yoksay */ } };

  useEffect(() => {
    if (!Object.keys(pending.current).length && note.version && note.version !== version.current) { setDraft({ ...note }); version.current = note.version; }
  }, [note]);

  // Kişisel notta son yazan kazanır (çevrimdışı kuyrukla uyumlu); paylaşılan
  // notta sürüm gönderilir, başkası değiştirdiyse çakışma uyarısı çıkar.
  const flush = useCallback(async ({ force = false } = {}) => {
    clearTimeout(timer.current);
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    setState("saving");
    const res = await patch(`/api/tools/notes/${note.id}`, shared && !force ? { ...changes, base_version: version.current } : changes);
    if (res.ok) {
      if (res.data?.item) { version.current = res.data.item.version; onSaved?.(res.data.item); } else onSaved?.({ ...latest.current, updatedAt: new Date().toISOString() });
      if (!Object.keys(pending.current).length) setState(res.queued ? "queued" : "saved");
      setSavedAt(new Date());
    } else {
      pending.current = { ...changes, ...pending.current };
      setState(res.error?.status === 409 ? "conflict" : "error");
    }
  }, [note.id, onSaved, shared]);

  const change = useCallback((p) => {
    if (readOnly) return;
    setDraft((prev) => ({ ...prev, ...p }));
    Object.keys(p).forEach((k) => { if (editableKeys.includes(k)) pending.current[k] = p[k]; });
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 800);
  }, [flush, readOnly]);
  useEffect(() => () => { clearTimeout(timer.current); if (Object.keys(pending.current).length) flush(); }, [flush]);
  useEffect(() => {
    if (!autoFocus || readOnly) return;
    if ((latest.current.title || "") === "Yeni not" && titleRef.current) { titleRef.current.focus(); titleRef.current.select(); } else ref.current?.focus();
  }, [autoFocus, readOnly]);

  const setBody = (r) => {
    change({ body: r.value });
    requestAnimationFrame(() => { const ta = ref.current; if (ta) { ta.focus(); ta.setSelectionRange(r.start, r.end); } });
  };
  const format = (kind) => {
    if (mode === "preview") setMode("write");
    const ta = ref.current;
    const value = latest.current.body || "";
    setBody(applyFormat(value, ta ? ta.selectionStart : value.length, ta ? ta.selectionEnd : value.length, kind));
  };
  const updatePopup = (value, caret) => {
    const slash = slashContext(value, caret);
    const wiki = !slash && wikiContext(value, caret);
    if (!slash && !wiki) { if (popup) setPopup(null); return; }
    const ta = ref.current;
    const pos = caretCoords(ta, caret);
    setPopup({ type: slash ? "slash" : "wiki", ctx: slash || wiki, index: 0, style: { top: Math.min(pos.top + pos.height + 6, (ta?.clientHeight || 400) - 40), left: Math.min(pos.left, Math.max(0, (ta?.clientWidth || 400) - 270)) } });
  };
  const wikiItems = useMemo(() => {
    if (popup?.type !== "wiki") return [];
    const q = lowerTr(popup.ctx.query).trim();
    const titles = [...new Set(notes.filter((n) => n.id !== note.id && n.title && !n.deleted_at).map((n) => n.title))];
    const out = titles.filter((t) => !q || lowerTr(t).includes(q)).slice(0, 8).map((t) => ({ key: t, label: t, icon: "note" }));
    if (q && !titles.some((t) => lowerTr(t) === q)) out.push({ key: `new:${popup.ctx.query}`, label: popup.ctx.query.trim(), hint: "Yeni not adı olarak bağla", icon: "plus", create: true });
    return out;
  }, [popup, notes, note.id]);
  const slashItems = useMemo(() => (popup?.type === "slash" ? filterSlash(popup.ctx.query).map((c) => ({ ...c, icon: SLASH_ICONS[c.icon] || "plus" })) : []), [popup]);
  const items = popup?.type === "slash" ? slashItems : wikiItems;
  const pick = (item) => {
    const value = latest.current.body || "";
    if (popup.type === "slash") setBody(runSlash(value, popup.ctx, item));
    else {
      const title = item.create ? item.label : item.key;
      const caret = ref.current?.selectionStart ?? value.length;
      const skip = value.slice(caret, caret + 2) === "]]" ? 2 : 0;
      const at = popup.ctx.from + title.length + 2;
      setBody({ value: `${value.slice(0, popup.ctx.from)}${title}]]${value.slice(caret + skip)}`, start: at, end: at });
    }
    setPopup(null);
  };
  const onKeyDown = (e) => {
    const ta = e.currentTarget;
    if (popup && items.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPopup((p) => ({ ...p, index: (p.index + 1) % items.length })); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPopup((p) => ({ ...p, index: (p.index - 1 + items.length) % items.length })); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(items[popup.index] || items[0]); return; }
    }
    if (popup && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPopup(null); return; }
    const kind = shortcutOf(e);
    if (kind) { e.preventDefault(); format(kind); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && ta.selectionStart === ta.selectionEnd) {
      const r = continueList(ta.value, ta.selectionStart);
      if (r) { e.preventDefault(); setBody(r); }
      return;
    }
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setBody(indentLines(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey)); }
  };

  const stats = useMemo(() => textStats(draft), [draft]);
  const outgoing = useMemo(() => wikiLinks(draft.body).map((title) => ({ title, note: findByTitle(notes, title) })), [draft.body, notes]);
  const incoming = useMemo(() => backlinks(notes, draft), [notes, draft]);
  const hasNote = useCallback((title) => Boolean(findByTitle(notes, title)), [notes]);
  const tree = useMemo(() => notebookTree(notebooks), [notebooks]);
  const project = projects.find((p) => Number(p.id) === Number(draft.project_id));
  const linked = (draft.contact_ids || []).map((id) => contacts.find((c) => Number(c.id) === Number(id))).filter(Boolean);
  const showWrite = !readOnly && mode !== "preview";
  const showPreview = readOnly || mode !== "write";
  const selection = () => (ref.current ? ref.current.value.slice(ref.current.selectionStart, ref.current.selectionEnd) : "");
  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    setTagInput("");
    if (t && !(draft.tags || []).some((x) => lowerTr(x) === lowerTr(t))) change({ tags: [...(draft.tags || []), t].slice(0, 12) });
  };

  const menu = [
    { label: "Sürüm geçmişi", icon: "undo", onClick: () => onAction("versions", draft) },
    owner && { label: note.share_count ? `Paylaşım (${note.share_count} kişi)` : "Paylaş…", icon: "userPlus", onClick: () => onAction("share", draft) },
    !readOnly && { label: "Proje / kişi bağla…", icon: "link", onClick: () => onAction("links", draft) },
    "-",
    { label: "Yapılacaklar'a görev ekle", icon: "checkSquare", onClick: () => onAction("task", draft, selection()) },
    { label: "Ajandaya etkinlik ekle", icon: "calendar", onClick: () => onAction("event", draft) },
    owner && { label: "Çoğalt", icon: "copy", onClick: () => onAction("duplicate", draft) },
    "-",
    { label: "Markdown olarak kaydet", icon: "download", onClick: () => onAction("markdown", draft) },
    { label: "PDF olarak kaydet", icon: "file", onClick: () => onAction("pdf", draft) },
    { label: "Yazdır", icon: "printer", onClick: () => onAction("print", draft) },
    { label: "Panoya kopyala", icon: "copy", onClick: () => onAction("copy", draft) },
    draft.kind === "checklist" && !readOnly && { label: "Maddeleri metne çevir", icon: "list", onClick: () => change({ kind: "text", body: checklistToBody(latest.current), checklist: [] }) },
    "-",
    owner && { label: draft.archived ? "Arşivden çıkar" : "Arşivle", icon: "archive", onClick: () => onAction("archive", draft) },
    owner && { label: "Çöp kutusuna taşı", icon: "trash", danger: true, onClick: () => onAction("trash", draft) },
    !owner && { label: "Paylaşımdan ayrıl", icon: "logout", danger: true, onClick: () => onAction("leave", draft) },
  ].filter(Boolean);

  return (
    <article className={`nt-editor${focus ? " is-focus" : ""}`} style={draft.color ? { "--nt-cover": draft.color } : undefined} aria-label="Not düzenleyici">
      {note.deleted_at && <div className="nt-banner"><Icon name="trash" size={14} /> Bu not çöp kutusunda.<button type="button" className="btn btn--sm btn--primary" onClick={() => onAction("restore", draft)}>Geri al</button></div>}
      {note.access === "viewer" && !note.deleted_at && <div className="nt-banner nt-banner--info"><Icon name="eye" size={14} /> {note.owner?.name || "Not sahibi"} bu notu sizinle görüntüleyici olarak paylaştı.</div>}
      {note.access === "editor" && <div className="nt-banner nt-banner--info"><Icon name="users" size={14} /> {note.owner?.name || "Not sahibi"} ile ortak not · düzenleyebilirsiniz.</div>}
      {state === "conflict" && (
        <div className="nt-banner nt-banner--warn" role="alert"><Icon name="alert" size={14} /> Not siz yazarken başka biri tarafından değiştirildi.
          <button type="button" className="btn btn--sm" onClick={() => onAction("reload", draft)}>Güncel hâli al</button>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => flush({ force: true })}>Benimkini kaydet</button>
        </div>
      )}
      <header className="nt-editor__head">
        <div className="nt-editor__titlerow">
          {readOnly ? (draft.emoji && <span className="nt-emoji__btn has-value">{draft.emoji}</span>) : <EmojiPicker value={draft.emoji} onChange={(emoji) => change({ emoji })} />}
          <input ref={titleRef} className="nt-editor__title" value={draft.title || ""} placeholder="Başlıksız not" readOnly={readOnly} maxLength={200} aria-label="Başlık" onChange={(e) => change({ title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ref.current?.focus(); } }} onBlur={() => flush()} />
          {owner && !note.deleted_at && <button type="button" className={`icon-btn ${draft.pinned ? "is-on" : ""}`} title={draft.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} aria-pressed={draft.pinned} onClick={() => change({ pinned: !draft.pinned })}><Icon name="pin" /></button>}
          <button type="button" className={`icon-btn ${focus ? "is-on" : ""}`} title={focus ? "Odak modundan çık (esc)" : "Odak modu (⌘.)"} aria-pressed={focus} onClick={onToggleFocus}><Icon name="eye" /></button>
          <MenuButton items={menu} label="Not işlemleri" />
        </div>
        <div className="nt-editor__meta">
          {owner && !note.deleted_at ? (
            <select className="select-sm" value={draft.notebook_id ?? ""} onChange={(e) => change({ notebook_id: e.target.value ? Number(e.target.value) : null })} aria-label="Defter">
              <option value="">Defter yok</option>
              {tree.map((nb) => <option key={nb.id} value={nb.id}>{`${"  ".repeat(nb.depth)}${nb.emoji ? `${nb.emoji} ` : ""}${nb.name}`}</option>)}
            </select>
          ) : note.owner ? <span className="chip"><Icon name="user" size={12} /> {note.owner.name}</span> : null}
          {!readOnly && (
            <div className="color-dots" role="radiogroup" aria-label="Kapak rengi">
              {COLORS.map((c) => <button key={c || "none"} type="button" role="radio" aria-checked={(draft.color || "") === c} className={(draft.color || "") === c ? "is-on" : ""} style={{ background: c || "var(--surface)" }} onClick={() => change({ color: c || null })} aria-label={c ? `Renk ${c}` : "Renksiz"} />)}
            </div>
          )}
          <span className="nt-spacer" />
          {!readOnly && (
            <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Görünüm" options={[{ value: "write", label: "Yaz" }, { value: "split", label: "Yan yana" }, { value: "preview", label: "Önizleme" }]} />
          )}
        </div>
      </header>
      {showWrite && (
        <div className="nt-toolbar" role="toolbar" aria-label="Biçim">
          {FORMAT_BUTTONS.map((b, i) => (b === "|" ? <span key={`s${i}`} className="nt-toolbar__sep" /> : (
            <button key={b.kind} type="button" className="nt-toolbar__btn" onMouseDown={(e) => e.preventDefault()} onClick={() => format(b.kind)} title={`${b.label} (${b.keys})`} aria-label={b.label}>
              {b.icon ? <Icon name={b.icon} size={14} /> : <b>{b.text}</b>}
            </button>
          )))}
          <span className="nt-toolbar__hint">"/" komut · [[ not bağla</span>
        </div>
      )}
      {draft.kind === "checklist" && <ChecklistEditor items={draft.checklist || []} onChange={(checklist) => change({ checklist })} readOnly={readOnly} />}
      <div className={`nt-editor__body is-${readOnly ? "preview" : mode}`}>
        {showWrite && (
          <div className="nt-write">
            <textarea
              ref={ref}
              className="nt-textarea"
              value={draft.body || ""}
              placeholder={"Yazmaya başlayın…\n\n# Başlık, - madde, - [ ] yapılacak, > alıntı, **kalın**, [[Not adı]]\n\"/\" yazarak komut menüsünü açın."}
              aria-label="Not metni"
              spellCheck
              onChange={(e) => { change({ body: e.target.value }); updatePopup(e.target.value, e.target.selectionStart); }}
              onKeyDown={onKeyDown}
              onClick={(e) => updatePopup(e.currentTarget.value, e.currentTarget.selectionStart)}
              onBlur={() => { setTimeout(() => setPopup(null), 120); flush(); }}
            />
            {popup && (
              <div className="nt-pop" style={popup.style} role="listbox" aria-label={popup.type === "slash" ? "Ekle" : "Not bağla"}>
                <div className="nt-pop__title">{popup.type === "slash" ? "Ekle" : "Not bağla"}</div>
                {items.length === 0 ? <div className="nt-pop__empty">Eşleşme yok</div> : items.map((it, i) => (
                  <button key={it.key} type="button" role="option" aria-selected={i === popup.index} className={`nt-pop__item${i === popup.index ? " is-active" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(it); }}>
                    <span className="nt-pop__icon"><Icon name={it.icon} size={13} /></span><span><strong>{it.label}</strong>{it.hint && <small>{it.hint}</small>}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showPreview && (
          <div className="nt-preview">
            <MarkdownView text={draft.body || ""} onWiki={(t) => onOpenTitle(t)} hasNote={hasNote} onToggleTask={readOnly ? undefined : (line) => change({ body: toggleTaskLine(latest.current.body || "", line) })} readOnly={readOnly} empty={<p className="muted">Önizlenecek metin yok.</p>} />
          </div>
        )}
      </div>
      <footer className="nt-tags">
        <Icon name="tag" size={14} />
        {(draft.tags || []).map((t) => <span key={t} className="chip">#{t}{!readOnly && <button type="button" onClick={() => change({ tags: draft.tags.filter((x) => x !== t) })} aria-label={`${t} etiketini kaldır`}>×</button>}</span>)}
        {!readOnly && <input list="nt-tags-list" value={tagInput} placeholder="Etiket ekle" aria-label="Etiket ekle" onChange={(e) => setTagInput(e.target.value)} onBlur={() => tagInput && addTag()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} />}
        <datalist id="nt-tags-list">{tagSuggestions.map((t) => <option key={t} value={t} />)}</datalist>
      </footer>
      {(outgoing.length > 0 || incoming.length > 0 || project || linked.length > 0) && (
        <section className="nt-links" aria-label="Bağlantılar">
          {(project || linked.length > 0) && (
            <div className="nt-links__group">
              <h4>Bağlı</h4>
              <div className="nt-links__chips">
                {project && <button type="button" className="chip chip--btn" onClick={() => go?.("projects", { id: project.id })}><Icon name="layers" size={12} /> {project.name}</button>}
                {linked.map((c) => <button key={c.id} type="button" className="chip chip--btn" onClick={() => go?.("contacts", String(c.id))}><Icon name="user" size={12} /> {c.name}</button>)}
              </div>
            </div>
          )}
          {outgoing.length > 0 && (
            <div className="nt-links__group">
              <h4>Bu notun bağlantıları</h4>
              <div className="nt-links__chips">{outgoing.map((l) => <button key={l.title} type="button" className={`chip chip--btn${l.note ? "" : " is-missing"}`} onClick={() => onOpenTitle(l.title)} title={l.note ? "Notu aç" : "Bu adda not yok — oluştur"}>{l.note?.emoji || <Icon name={l.note ? "note" : "plus"} size={12} />} {l.title}</button>)}</div>
            </div>
          )}
          {incoming.length > 0 && (
            <div className="nt-links__group">
              <h4>Geri bağlantılar ({incoming.length})</h4>
              <ul className="nt-backlinks">{incoming.map(({ note: n, line }) => <li key={n.id}><button type="button" onClick={() => onOpenTitle(n.title, n.id)}><strong>{n.emoji ? `${n.emoji} ` : ""}{n.title || "Başlıksız not"}</strong><small>{line}</small></button></li>)}</ul>
            </div>
          )}
        </section>
      )}
      <footer className="nt-editor__foot">
        <span>{stats.words} kelime · {stats.chars} karakter · ~{stats.minutes} dk okuma</span>
        <span className="nt-spacer" />
        {note.updated_by_name && <span>Son düzenleyen: {note.updated_by_name}</span>}
        <span>{relativeTime(note.updatedAt)}</span>
        {!readOnly && (
          <span className={`nt-save nt-save--${state}`} aria-live="polite">
            {state === "saving" ? "Kaydediliyor…" : state === "dirty" ? "Yazılıyor…" : state === "queued" ? "Çevrimdışı kaydedildi" : state === "error" ? <>Kaydedilemedi <button type="button" onClick={() => flush()}>Tekrar dene</button></> : state === "conflict" ? "Çakışma" : <><Icon name="check" size={12} /> Kaydedildi{savedAt ? ` · ${savedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}</>}
          </span>
        )}
      </footer>
    </article>
  );
}
