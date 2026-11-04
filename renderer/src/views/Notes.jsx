// Not Defteri: renkli notlar, işaretlenebilir listeler, etiketler, arşiv.
// Solda not listesi, sağda düzenleyici; yazdıkça kendiliğinden kaydedilir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, OfflineNote, Segmented, Spinner, useConfirm, useResult } from "../components/ui";
import { del, patch, post, tempId, useCommand, useResource } from "../api";
import { matchesQuery, notesToMarkdown, relativeTime } from "../lib/helpers";

const COLORS = ["", "#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#e5e7eb"];

export default function Notes({ arg }) {
  const [archived, setArchived] = useState("0");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState(arg && arg !== "new" ? arg : null);
  const result = useResult();
  const confirm = useConfirm();
  const searchRef = useRef(null);
  const notes = useResource("/api/tools/notes", { archived });

  const items = useMemo(() => (notes.data?.items || []).filter((n) => matchesQuery(n, query) && (!tag || (n.tags || []).includes(tag))), [notes.data, query, tag]);
  const tags = useMemo(() => [...new Set((notes.data?.items || []).flatMap((n) => n.tags || []))].sort((a, b) => a.localeCompare(b, "tr")), [notes.data]);
  const current = (notes.data?.items || []).find((n) => String(n.id) === String(selected));

  const create = useCallback(async (kind = "text") => {
    const id = tempId();
    const draft = { id, kind, title: "", body: kind === "text" ? " " : "", checklist: kind === "checklist" ? [{ text: "Yeni madde", done: false }] : [], tags: tag ? [tag] : [], color: null, pinned: false, archived: false, updatedAt: new Date().toISOString() };
    const res = await post("/api/tools/notes", { ...draft, id: undefined, body: draft.body }, { tempId: id });
    if (!result(res)) return;
    const item = res.data?.item || draft;
    if (archived !== "0") setArchived("0");
    notes.setData((d) => ({ ...(d || {}), items: [item, ...((d?.items) || [])] }));
    setSelected(item.id);
  }, [archived, notes, result, tag]);

  useCommand("new", () => create());
  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportMarkdown());
  useEffect(() => { if (arg === "new") create(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = useCallback(async (note, changes) => {
    notes.setData((d) => ({ ...d, items: d.items.map((n) => (n.id === note.id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n)) }));
    const res = await patch(`/api/tools/notes/${note.id}`, changes);
    if (!result(res)) notes.reload({ quiet: true });
    else if (res.data?.item) notes.setData((d) => ({ ...d, items: d.items.map((n) => (n.id === note.id ? res.data.item : n)) }));
  }, [notes, result]);

  const remove = async (note) => {
    if (!(await confirm({ title: "Notu sil", message: "Not kalıcı olarak silinsin mi? Arşive taşımak isterseniz Arşivle'yi kullanın.", confirmLabel: "Sil", danger: true }))) return;
    notes.setData((d) => ({ ...d, items: d.items.filter((n) => n.id !== note.id) }));
    setSelected(null);
    if (!result(await del(`/api/tools/notes/${note.id}`), "Not silindi.")) notes.reload({ quiet: true });
  };

  const exportMarkdown = async () => {
    const list = items.length ? items : notes.data?.items || [];
    if (!list.length) return;
    const res = await window.elitlig.files.save("Elitlig-Notlar.md", notesToMarkdown(list), [{ name: "Markdown", extensions: ["md"] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };

  return (
    <div className="view view--notes">
      <aside className="notes-list">
        <header className="notes-list__head">
          <h1>Notlar</h1>
          <div className="row-gap">
            <MenuButton icon="plus" label="Yeni" items={[{ label: "Metin notu", icon: "note", onClick: () => create("text") }, { label: "Yapılacaklar listesi", icon: "checkSquare", onClick: () => create("checklist") }]} />
            <MenuButton items={[{ label: "Markdown olarak dışa aktar", icon: "download", onClick: exportMarkdown }]} />
          </div>
        </header>
        <div className="search-box search-box--full"><Icon name="search" size={14} /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Notlarda ara" /></div>
        <Segmented value={archived} onChange={(v) => { setArchived(v); setSelected(null); }} size="sm" options={[{ value: "0", label: "Notlar" }, { value: "1", label: "Arşiv" }]} />
        {tags.length > 0 && (
          <div className="tag-bar">
            <button type="button" className={!tag ? "is-on" : ""} onClick={() => setTag("")}>Tümü</button>
            {tags.map((t) => <button key={t} type="button" className={tag === t ? "is-on" : ""} onClick={() => setTag(tag === t ? "" : t)}>#{t}</button>)}
          </div>
        )}
        <OfflineNote offline={notes.offline} savedAt={notes.savedAt} />
        <ErrorNote error={notes.error && !notes.data ? notes.error : null} onRetry={notes.reload} />
        {notes.loading && !notes.data ? <Spinner /> : (
          <ul className="notes-list__items">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" className={`note-item ${String(selected) === String(n.id) ? "is-active" : ""}`} style={n.color ? { "--note": n.color } : undefined} onClick={() => setSelected(n.id)}>
                  <strong>{n.pinned && <Icon name="pin" size={11} />} {n.title || (n.body || n.checklist?.[0]?.text || "Başlıksız not").trim().slice(0, 60)}</strong>
                  <span>{n.kind === "checklist" ? `${(n.checklist || []).filter((c) => c.done).length}/${(n.checklist || []).length} madde` : (n.title ? n.body || "" : "").trim().slice(0, 90)}</span>
                  <small>{relativeTime(n.updatedAt)}{n.tags?.length ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}` : ""}</small>
                </button>
              </li>
            ))}
            {!items.length && <Empty icon="note" title={archived === "1" ? "Arşiv boş" : "Not yok"} text={archived === "1" ? "" : "⌘N ile yeni not oluşturun."} />}
          </ul>
        )}
      </aside>
      <section className="note-editor-wrap">
        {current ? <NoteEditor key={current.id} note={current} onSave={save} onDelete={remove} /> : (
          <Empty icon="note" title="Bir not seçin" text="Ya da yeni bir not oluşturun." action={<button type="button" className="btn btn--primary" onClick={() => create()}><Icon name="plus" /> Yeni not</button>} />
        )}
      </section>
    </div>
  );
}

function NoteEditor({ note, onSave, onDelete }) {
  const [title, setTitle] = useState(note.title || "");
  const [body, setBody] = useState((note.body || "").replace(/^ $/, ""));
  const [tagInput, setTagInput] = useState("");
  const timer = useRef(null);
  const pending = useRef({});

  // Yazdıkça 800 ms sonra kaydeder; not değişirken bekleyen kayıt hemen gönderilir.
  const queue = (changes) => {
    pending.current = { ...pending.current, ...changes };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };
  const flush = () => {
    clearTimeout(timer.current);
    const changes = pending.current;
    pending.current = {};
    if (Object.keys(changes).length) onSave(note, changes);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const checklist = note.checklist || [];
  const setChecklist = (next) => onSave(note, { checklist: next });

  return (
    <article className="note-editor" style={note.color ? { "--note": note.color } : undefined}>
      <header className="note-editor__bar">
        <span className="muted small">Son düzenleme {relativeTime(note.updatedAt)}</span>
        <div className="row-gap">
          <div className="color-dots">
            {COLORS.map((c) => <button key={c || "none"} type="button" className={(note.color || "") === c ? "is-on" : ""} style={{ background: c || "var(--surface)" }} onClick={() => onSave(note, { color: c || null })} aria-label="Renk" />)}
          </div>
          <button type="button" className={`icon-btn ${note.pinned ? "is-on" : ""}`} title="Sabitle" onClick={() => onSave(note, { pinned: !note.pinned })}><Icon name="pin" /></button>
          <button type="button" className="icon-btn" title={note.archived ? "Arşivden çıkar" : "Arşivle"} onClick={() => onSave(note, { archived: !note.archived })}><Icon name="archive" /></button>
          <MenuButton items={[
            { label: note.kind === "checklist" ? "Metin notuna çevir" : "Listeye çevir", icon: "checkSquare", onClick: () => onSave(note, note.kind === "checklist" ? { kind: "text", body: checklist.map((c) => `${c.done ? "✓" : "•"} ${c.text}`).join("\n"), checklist: [] } : { kind: "checklist", checklist: body.split("\n").map((t) => t.replace(/^[-•✓*]\s*/, "").trim()).filter(Boolean).map((text) => ({ text, done: false })), body: null }) },
            { label: "Panoya kopyala", icon: "copy", onClick: () => navigator.clipboard.writeText([title, body, ...checklist.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.text}`)].filter(Boolean).join("\n")) },
            "-",
            { label: "Sil", icon: "trash", danger: true, onClick: () => onDelete(note) },
          ]} />
        </div>
      </header>
      <input className="note-editor__title" value={title} placeholder="Başlık" onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value }); }} onBlur={flush} />
      {note.kind === "checklist" ? (
        <ChecklistEditor items={checklist} onChange={setChecklist} />
      ) : (
        <textarea className="note-editor__body" value={body} placeholder="Yazmaya başlayın…" onChange={(e) => { setBody(e.target.value); queue({ body: e.target.value }); }} onBlur={flush} />
      )}
      <footer className="note-editor__tags">
        <Icon name="tag" size={14} />
        {(note.tags || []).map((t) => <span key={t} className="chip">#{t}<button type="button" onClick={() => onSave(note, { tags: note.tags.filter((x) => x !== t) })}>×</button></span>)}
        <input value={tagInput} placeholder="Etiket ekle" onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
            e.preventDefault();
            onSave(note, { tags: [...new Set([...(note.tags || []), tagInput.trim().replace(/^#/, "")])] });
            setTagInput("");
          }
        }} />
      </footer>
    </article>
  );
}

function ChecklistEditor({ items, onChange }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState({});
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const indexOf = (item) => items.indexOf(item);
  const update = (item, patchItem) => onChange(items.map((x, i) => (i === indexOf(item) ? { ...x, ...patchItem } : x)));
  const row = (item) => {
    const i = indexOf(item);
    return (
      <li key={i}>
        <input type="checkbox" checked={item.done} onChange={() => update(item, { done: !item.done })} />
        <input className={item.done ? "is-done" : ""} value={drafts[i] ?? item.text} onChange={(e) => setDrafts({ ...drafts, [i]: e.target.value })}
          onBlur={() => { if (drafts[i] != null && drafts[i] !== item.text) { update(item, { text: drafts[i] }); setDrafts({}); } }} />
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Sil"><Icon name="x" size={12} /></button>
      </li>
    );
  };
  return (
    <div className="note-checklist">
      <ul>{open.map(row)}</ul>
      <form className="inline-add" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onChange([...items, { text: text.trim(), done: false }]); setText(""); }}>
        <Icon name="plus" size={14} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Madde ekle ve ↩" />
      </form>
      {done.length > 0 && <><h4 className="muted small">Tamamlanan ({done.length})</h4><ul>{done.map(row)}</ul></>}
    </div>
  );
}
