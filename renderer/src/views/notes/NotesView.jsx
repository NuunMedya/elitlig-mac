// Not Defteri (masaüstü): web'deki Not Defteri'yle aynı özellikler.
// Solda akıllı listeler (Tüm notlar, Sabitlenenler, Son düzenlenenler, Görev
// içerenler, Benimle paylaşılanlar, Arşiv, Çöp kutusu), iç içe defterler ve
// etiketler; ortada vurgulu tam metin arama, liste / ızgara; sağda düzenleyici.
// ⌘N yeni not, ⌘F ara, ⌘. odak modu. Bağlantı yokken notlar önbellekten
// açılır; yazılanlar kuyruğa alınır ve bağlantı gelince eşitlenir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, ErrorNote, Icon, MenuButton, OfflineNote, Segmented, Spinner, keyLabel, useConfirm, useResult, useToast } from "../../components/ui";
import { del, get, patch, post, tempId, useCommand, useResource } from "../../api";
import { formatDate, relativeTime } from "../../lib/helpers";
import {
  SMART_LISTS, SORTS, fileSafe, filterNotes, findByTitle, fromTemplate, highlight, noteText, noteToMarkdown, notebookPath,
  notebookTree, notesToMarkdown, previewOf, renameLinks, searchNotes, sortNotes, taskStats,
} from "../../lib/noteCore";
import NoteEditor from "./NoteEditor";
import MarkdownView from "./MarkdownView";
import { EventDialog, LinksDialog, NotebookDialog, ShareDialog, TaskDialog, TemplatePicker, VersionsDialog } from "./dialogs";
import "./notes.css";

const LIST_ICONS = { notes: "note", pin: "pin", clock: "clock", check: "checkSquare", share: "users", archive: "archive", trash: "trash" };
const readLocal = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* yoksay */ } };
const Highlighted = ({ text, query }) => highlight(text, query).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>));

const PRINT_CSS = "body{font:12pt/1.6 -apple-system,'Segoe UI',sans-serif;color:#111;margin:18mm}h1{font-size:22pt;margin:0 0 4pt}.meta{color:#666;font-size:9pt;margin:0 0 14pt}blockquote{border-left:3px solid #999;margin:0 0 10pt;padding:2pt 10pt;color:#444}pre{background:#f4f4f4;padding:8pt;border-radius:6pt}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4pt 8pt}.nt-md__list.is-tasks{list-style:none;padding-left:0}.nt-md__task{display:flex;gap:6pt}.nt-md__wiki{border:0;background:none;padding:0;font:inherit;text-decoration:underline}code{background:#f1f1f1;padding:0 3pt;border-radius:3pt}";

export default function NotesView({ arg, argSeq, go }) {
  const result = useResult();
  const confirm = useConfirm();
  const toast = useToast();
  const notesRes = useResource("/api/tools/notes", { view: "all" });
  const [trash, setTrash] = useState(null);
  const [scope, setScope] = useState(() => (arg && typeof arg === "object" && arg.notebook ? { list: "all", notebookId: Number(arg.notebook), tag: "" } : { list: "all", notebookId: null, tag: "" }));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(() => readLocal("notes:sort", "updated"));
  const [layout, setLayout] = useState(() => readLocal("notes:layout", "list"));
  const [selected, setSelected] = useState(arg && typeof arg !== "object" && arg !== "new" && arg !== "template" ? Number(arg) || arg : null);
  const [justCreated, setJustCreated] = useState(null);
  const [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [projects, setProjects] = useState([]);
  const [contacts, setContacts] = useState([]);
  const searchRef = useRef(null);

  const notes = useMemo(() => notesRes.data?.items || [], [notesRes.data]);
  const notebooks = useMemo(() => notesRes.data?.notebooks || [], [notesRes.data]);
  const trashCount = trash ? trash.length : notesRes.data?.trash_count || 0;
  const setNotes = useCallback((fn) => notesRes.setData((d) => ({ ...(d || {}), items: fn(d?.items || []) })), [notesRes]);
  const setNotebooks = (fn) => notesRes.setData((d) => ({ ...(d || {}), notebooks: fn(d?.notebooks || []) }));
  const replace = useCallback((item) => setNotes((list) => list.map((n) => (String(n.id) === String(item.id) ? { ...n, ...item } : n))), [setNotes]);

  const loadTrash = useCallback(async () => { const r = await get("/api/tools/notes", { view: "trash" }); setTrash(r.ok ? r.data.items || [] : []); }, []);
  useEffect(() => { if (scope.list === "trash") loadTrash(); }, [scope.list, loadTrash]);
  useEffect(() => {
    get("/api/tools/projects", { archived: 0 }).then((r) => r.ok && setProjects((r.data.items || []).map((p) => ({ id: p.id, name: p.name }))));
    get("/api/tools/contacts").then((r) => r.ok && setContacts((r.data.items || []).map((c) => ({ id: c.id, name: c.name, company: c.company }))));
  }, []);

  const source = scope.list === "trash" ? trash || [] : notes;
  const scoped = useMemo(() => filterNotes(source, { ...scope, notebooks }), [source, scope, notebooks]);
  const results = useMemo(() => (query.trim() ? searchNotes(scoped, query) : sortNotes(scoped, sort, { pinnedFirst: scope.list !== "trash" }).map((note) => ({ note, snippet: null }))), [scoped, query, sort, scope.list]);
  const current = notes.find((n) => String(n.id) === String(selected)) || (trash || []).find((n) => String(n.id) === String(selected)) || null;
  const counts = useMemo(() => Object.fromEntries(SMART_LISTS.map((l) => [l.key, l.key === "trash" ? trashCount : filterNotes(notes, { list: l.key }).length])), [notes, trashCount]);
  const tree = useMemo(() => notebookTree(notebooks), [notebooks]);
  const nbCount = useMemo(() => { const m = new Map(); notes.forEach((n) => { if (!n.archived && !n.deleted_at && n.notebook_id != null) m.set(Number(n.notebook_id), (m.get(Number(n.notebook_id)) || 0) + 1); }); return m; }, [notes]);
  const tags = useMemo(() => { const m = new Map(); notes.forEach((n) => { if (!n.archived && !n.deleted_at) (n.tags || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [notes]);

  /* --------------------------------- işlemler --------------------------------- */

  const create = useCallback(async (template = "blank", extra = {}) => {
    const draft = { ...fromTemplate(template), ...extra };
    if (scope.notebookId != null && !("notebook_id" in extra)) draft.notebook_id = scope.notebookId;
    if (scope.tag && !draft.tags.includes(scope.tag)) draft.tags = [...draft.tags, scope.tag];
    if (!draft.title && !(draft.body || "").trim()) draft.title = "Yeni not";
    const id = tempId();
    const res = await post("/api/tools/notes", draft, { tempId: id });
    if (!result(res)) return null;
    const item = res.data?.item || { ...draft, id, version: 1, access: "owner", pinned: false, archived: false, checklist: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    setNotes((list) => [item, ...list]);
    if (["archived", "trash", "shared"].includes(scope.list)) setScope((s) => ({ ...s, list: "all" }));
    setQuery("");
    setSelected(item.id);
    setJustCreated(item.id);
    return item;
  }, [scope, result, setNotes]);

  useCommand("new", () => create());
  useCommand("find", () => searchRef.current?.focus());
  useCommand("export", () => exportAll());
  // Palet / bağlantıdan gelen hedef (görünüm açıkken de): not kimliği ya da defter.
  useEffect(() => {
    if (arg && typeof arg === "object" && arg.notebook) setScope({ list: "all", notebookId: Number(arg.notebook), tag: "" });
    else if (arg && typeof arg !== "object" && !["new", "template"].includes(arg)) setSelected(Number(arg) || arg);
  }, [arg, argSeq]);
  // "Yeni not" / "Şablondan yeni not": Not Defteri zaten açıkken de çalışır (argSeq).
  useEffect(() => {
    if (arg === "new") create();
    if (arg === "template") setDialog({ kind: "templates" });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [arg, argSeq]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "." && current) { e.preventDefault(); setFocus((v) => !v); }
      if (e.key === "Escape" && focus && !dialog) setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, focus, dialog]);

  const savePatch = async (note, values, msg) => {
    replace({ ...note, ...values });
    const res = await patch(`/api/tools/notes/${note.id}`, values);
    if (!result(res, msg)) notesRes.reload({ quiet: true });
    else if (res.data?.item) replace(res.data.item);
  };

  const onSaved = useCallback((item) => {
    const before = notes.find((n) => String(n.id) === String(item.id));
    replace(item);
    if (before?.title && item.title && before.title !== item.title) {
      const affected = notes.filter((n) => n.id !== item.id && (n.access || "owner") !== "viewer" && renameLinks(n.body, before.title, item.title) !== n.body);
      affected.forEach((n) => { const body = renameLinks(n.body, before.title, item.title); replace({ ...n, body }); patch(`/api/tools/notes/${n.id}`, { body }); });
      if (affected.length) toast(`${affected.length} nottaki bağlantı yeni ada güncellendi.`, { tone: "info" });
    }
  }, [notes, replace, toast]);

  const openTitle = useCallback(async (title, id) => {
    const target = id ? notes.find((n) => n.id === id) : findByTitle(notes, title);
    if (target) { setSelected(target.id); return; }
    await create("blank", { title: title.trim(), body: "" });
  }, [notes, create]);

  const trashNote = async (note) => {
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setSelected(null);
    setTrash(null);
    const res = await del(`/api/tools/notes/${note.id}`);
    if (!res.ok) { result(res); notesRes.reload({ quiet: true }); return; }
    toast("Not çöp kutusuna taşındı.", { tone: "success", timeout: 6000, action: { label: "Geri al", run: () => restore(note) } });
  };
  const restore = async (note) => {
    const res = await post(`/api/tools/notes/${note.id}/restore`);
    if (!result(res, "Not geri alındı.")) return;
    setTrash((list) => (list || []).filter((n) => n.id !== note.id));
    notesRes.reload({ quiet: true });
  };
  const destroy = async (note) => {
    if (!(await confirm({ title: "Kalıcı olarak sil", message: `"${note.title || "Başlıksız not"}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`, danger: true, confirmLabel: "Kalıcı sil" }))) return;
    if (result(await window.elitlig.request({ method: "DELETE", path: `/api/tools/notes/${note.id}`, query: { permanent: 1 } }), "Not kalıcı olarak silindi.")) { setTrash((list) => (list || []).filter((n) => n.id !== note.id)); if (selected === note.id) setSelected(null); }
  };
  const emptyTrash = async () => {
    if (!trashCount || !(await confirm({ title: "Çöp kutusunu boşalt", message: `${trashCount} not kalıcı olarak silinsin mi?`, danger: true, confirmLabel: "Boşalt" }))) return;
    if (result(await del("/api/tools/notes/trash"), "Çöp kutusu boşaltıldı.")) { setTrash([]); setSelected(null); }
  };

  // Yazdırma görünümü yalnız gerektiğinde yüklenir (react-dom/server).
  const noteHtml = async (note) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const body = renderToStaticMarkup(<MarkdownView text={[note.body || "", ...(note.checklist || []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}`)].filter(Boolean).join("\n")} readOnly />);
    const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const meta = [note.notebook_id != null ? notebookPath(notebooks, note.notebook_id) : null, (note.tags || []).map((t) => `#${t}`).join(" "), formatDate(note.updatedAt, { day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(" · ");
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(note.title)}</title><style>${PRINT_CSS}</style></head><body><h1>${esc(`${note.emoji ? `${note.emoji} ` : ""}${note.title || "Başlıksız not"}`)}</h1><p class="meta">${esc(meta)}</p>${body}</body></html>`;
  };
  const saveText = async (name, text, ext, label) => {
    const res = await window.elitlig.files.save(name, text, [{ name: label, extensions: [ext] }]);
    if (res.ok) window.elitlig.files.reveal(res.path);
  };
  const exportAll = () => { const list = results.map((r) => r.note); if (list.length) saveText("Elitlig-Notlar.md", notesToMarkdown(list, { notebooks }), "md", "Markdown"); };

  const onAction = async (kind, note, extra) => {
    if (kind === "trash") return trashNote(note);
    if (kind === "restore") return restore(note);
    if (kind === "archive") return savePatch(note, { archived: !note.archived }, note.archived ? "Not arşivden çıkarıldı." : "Not arşivlendi.");
    if (kind === "duplicate") { await create("blank", { kind: note.kind, title: note.title ? `${note.title} (kopya)` : "", body: note.body || "", checklist: note.checklist || [], tags: note.tags || [], color: note.color, emoji: note.emoji, notebook_id: note.notebook_id ?? null }); return undefined; }
    if (kind === "copy") { await navigator.clipboard.writeText(noteText(note)); toast("Not panoya kopyalandı.", { tone: "success" }); return undefined; }
    if (kind === "markdown") return saveText(`${fileSafe(note.title)}.md`, noteToMarkdown(note, { notebooks }), "md", "Markdown");
    if (kind === "print") return window.elitlig.print(await noteHtml(note), note.title || "Not");
    if (kind === "pdf") return window.elitlig.pdf(await noteHtml(note), fileSafe(note.title));
    if (kind === "reload") { const r = await get(`/api/tools/notes/${note.id}`); if (r.ok) { replace(r.data.item); setSelected(null); setTimeout(() => setSelected(note.id), 0); } return undefined; }
    if (kind === "leave") {
      if (!(await confirm({ title: "Paylaşımdan ayrıl", message: "Bu not artık listenizde görünmeyecek.", confirmLabel: "Ayrıl" }))) return undefined;
      if (result(await del(`/api/tools/notes/${note.id}/shares/me`), "Paylaşımdan ayrıldınız.")) { setNotes((list) => list.filter((n) => n.id !== note.id)); setSelected(null); }
      return undefined;
    }
    setDialog({ kind, note, extra });
    return undefined;
  };

  const deleteNotebook = async (nb) => {
    if (!(await confirm({ title: "Defteri sil", message: `"${nb.name}" silinsin mi? İçindeki notlar silinmez, bir üst düzeye taşınır.`, danger: true, confirmLabel: "Sil" }))) return;
    if (result(await del(`/api/tools/notes/notebooks/${nb.id}`), "Defter silindi.")) { setDialog(null); if (scope.notebookId === nb.id) setScope({ list: "all", notebookId: null, tag: "" }); notesRes.reload({ quiet: true }); }
  };

  const scopeTitle = scope.notebookId != null ? notebookPath(notebooks, scope.notebookId) : scope.tag ? `#${scope.tag}` : SMART_LISTS.find((l) => l.key === scope.list)?.label;
  const pick = (next) => { setScope(next); setSelected(null); };

  return (
    <div className={`view view--nt${focus && current ? " is-focus" : ""}`}>
      <aside className="nt-side" aria-label="Not listeleri">
        <header className="nt-side__top">
          <h1>Notlar</h1>
          <MenuButton icon="plus" label="Yeni" items={[
            { label: "Boş not", icon: "note", onClick: () => create() },
            { label: "Şablondan…", icon: "layers", onClick: () => setDialog({ kind: "templates" }) },
            "-",
            { label: "Yeni defter", icon: "folder", onClick: () => setDialog({ kind: "notebook", initial: { parent_id: scope.notebookId } }) },
          ]} />
        </header>
        <nav className="nt-side__group">
          {SMART_LISTS.map((l) => (
            <button key={l.key} type="button" className={`nt-side__item${scope.list === l.key && scope.notebookId == null && !scope.tag ? " is-active" : ""}`} onClick={() => pick({ list: l.key, notebookId: null, tag: "" })} title={l.hint}>
              <Icon name={LIST_ICONS[l.icon]} size={14} /><span>{l.label}</span>{counts[l.key] > 0 && <b>{counts[l.key]}</b>}
            </button>
          ))}
        </nav>
        <div className="nt-side__head"><h3>Defterler</h3><button type="button" className="icon-btn icon-btn--xs" onClick={() => setDialog({ kind: "notebook", initial: {} })} aria-label="Yeni defter" title="Yeni defter"><Icon name="plus" size={13} /></button></div>
        <nav className="nt-side__group" aria-label="Defterler">
          {!tree.length && <p className="nt-side__empty">Notları defterlere ayırın: Toplantılar, Sahalar, Lig 2026…</p>}
          {tree.map((nb) => (
            <div key={nb.id} className={`nt-side__item nt-side__nb${scope.notebookId === nb.id ? " is-active" : ""}`} style={{ paddingLeft: 8 + nb.depth * 14 }}>
              <button type="button" className="nt-side__nbbtn" onClick={() => pick({ list: "all", notebookId: nb.id, tag: "" })} style={nb.color ? { "--nb": nb.color } : undefined}>
                <span className="nt-side__nbicon">{nb.emoji || <Icon name="folder" size={13} />}</span><span>{nb.name}</span>
              </button>
              {nbCount.get(Number(nb.id)) > 0 && <b>{nbCount.get(Number(nb.id))}</b>}
              <button type="button" className="icon-btn icon-btn--xs nt-side__edit" onClick={() => setDialog({ kind: "notebook", initial: nb })} aria-label={`${nb.name} defterini düzenle`}><Icon name="pencil" size={12} /></button>
            </div>
          ))}
        </nav>
        {tags.length > 0 && <>
          <div className="nt-side__head"><h3>Etiketler</h3></div>
          <div className="nt-side__tags">{tags.slice(0, 24).map(([t, n]) => <button key={t} type="button" className={scope.tag === t ? "is-on" : ""} onClick={() => pick({ list: "all", notebookId: null, tag: scope.tag === t ? "" : t })}>#{t} <small>{n}</small></button>)}</div>
        </>}
      </aside>

      <section className="nt-listpane" aria-label="Notlar">
        <div className="nt-listpane__head">
          <div className="nt-listpane__title"><h2>{scopeTitle}</h2><span className="muted small">{results.length} not</span>{scope.list === "trash" && trashCount > 0 && <button type="button" className="btn btn--sm" onClick={emptyTrash}>Boşalt</button>}</div>
          <div className="search-box search-box--full"><Icon name="search" size={14} /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={keyLabel("Notlarda ara (⌘F)")} aria-label="Notlarda ara" onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); if (e.key === "Enter" && results[0]) setSelected(results[0].note.id); }} /></div>
          <div className="row-gap">
            <select className="select-sm" value={sort} onChange={(e) => { setSort(e.target.value); writeLocal("notes:sort", e.target.value); }} aria-label="Sıralama" disabled={Boolean(query.trim())}>{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            <Segmented value={layout} onChange={(v) => { setLayout(v); writeLocal("notes:layout", v); }} size="sm" ariaLabel="Görünüm" options={[{ value: "list", icon: "list", label: "", title: "Liste" }, { value: "grid", icon: "grid", label: "", title: "Izgara" }]} />
            <MenuButton icon="download" label="Dışa aktar" items={[{ label: "Listedekileri Markdown olarak kaydet", icon: "download", onClick: exportAll }]} />
          </div>
        </div>
        <OfflineNote offline={notesRes.offline} savedAt={notesRes.savedAt} />
        <ErrorNote error={notesRes.error && !notesRes.data ? notesRes.error : null} onRetry={notesRes.reload} />
        {(notesRes.loading && !notesRes.data) || (scope.list === "trash" && trash == null) ? <Spinner /> : results.length === 0 ? (
          <Empty icon={scope.list === "trash" ? "trash" : "note"} title={query ? "Aramaya uyan not yok" : scope.list === "trash" ? "Çöp kutusu boş" : scope.list === "archived" ? "Arşiv boş" : "Burada not yok"} text={query ? "Tüm kelimeler notta geçmelidir." : scope.list === "trash" ? "Silinen notlar 30 gün burada kalır." : "⌘N ile yeni not oluşturun ya da bir şablon seçin."} />
        ) : (
          <ul className={`nt-items nt-items--${layout}`}>
            {results.map(({ note: n, snippet }) => {
              const t = taskStats(n);
              return (
                <li key={n.id}>
                  <button type="button" className={`nt-item${String(selected) === String(n.id) ? " is-active" : ""}`} style={n.color ? { "--nt-cover": n.color } : undefined} onClick={() => setSelected(n.id)} aria-label={n.title || "Başlıksız not"}>
                    <strong>{n.emoji && <span className="nt-item__emoji">{n.emoji}</span>}<Highlighted text={n.title || "Başlıksız not"} query={query} />{n.pinned && <Icon name="pin" size={11} />}</strong>
                    <span className="nt-item__body"><Highlighted text={snippet || previewOf(n, layout === "grid" ? 200 : 110)} query={query} /></span>
                    <small>
                      {relativeTime(n.updatedAt)}
                      {n.notebook_id != null && ` · ${notebookPath(notebooks, n.notebook_id).split(" › ").pop()}`}
                      {t.total > 0 && ` · ☑ ${t.done}/${t.total}`}
                      {n.access && n.access !== "owner" && ` · ${n.owner?.name || "paylaşılan"}`}
                      {n.share_count > 0 && ` · ${n.share_count} kişiyle`}
                      {(n.tags || []).length > 0 && ` · ${n.tags.slice(0, 3).map((x) => `#${x}`).join(" ")}`}
                    </small>
                  </button>
                  {scope.list === "trash" && (
                    <div className="nt-trashacts"><span className="muted small">{formatDate(n.deleted_at, { day: "numeric", month: "short" })} silindi</span><button type="button" className="btn btn--sm" onClick={() => restore(n)}>Geri al</button><button type="button" className="btn btn--sm btn--danger" onClick={() => destroy(n)}>Kalıcı sil</button></div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="nt-editpane">
        {current ? (
          <NoteEditor key={current.id} note={current} notes={notes} notebooks={notebooks} projects={projects} contacts={contacts} tagSuggestions={tags.map(([t]) => t)}
            onSaved={onSaved} onOpenTitle={openTitle} onAction={onAction} go={go} focus={focus} onToggleFocus={() => setFocus((v) => !v)} autoFocus={justCreated === current.id} />
        ) : (
          <Empty icon="note" title="Bir not seçin" text="Ya da yeni bir not oluşturun." action={<div className="row-gap"><button type="button" className="btn btn--primary" onClick={() => create()}><Icon name="plus" /> Yeni not</button><button type="button" className="btn" onClick={() => setDialog({ kind: "templates" })}>Şablonlar</button></div>} />
        )}
      </section>

      {dialog?.kind === "templates" && <TemplatePicker onClose={() => setDialog(null)} onPick={async (key) => { setDialog(null); await create(key); }} />}
      {dialog?.kind === "notebook" && <NotebookDialog initial={dialog.initial} notebooks={notebooks} onClose={() => setDialog(null)} onDelete={deleteNotebook} onSaved={(item, edited) => { setDialog(null); setNotebooks((list) => (edited ? list.map((nb) => (nb.id === item.id ? { ...nb, ...item } : nb)) : [...list, item])); if (!edited) pick({ list: "all", notebookId: item.id, tag: "" }); }} />}
      {dialog?.kind === "share" && <ShareDialog note={dialog.note} onClose={() => setDialog(null)} onSaved={(shares) => { replace({ ...dialog.note, share_count: shares.length }); setDialog(null); }} />}
      {dialog?.kind === "versions" && <VersionsDialog note={dialog.note} readOnly={dialog.note.access === "viewer"} onClose={() => setDialog(null)} onRestored={(item) => { replace(item); setDialog(null); setSelected(null); setTimeout(() => setSelected(item.id), 0); }} />}
      {dialog?.kind === "task" && <TaskDialog note={dialog.note} selection={dialog.extra || ""} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
      {dialog?.kind === "event" && <EventDialog note={dialog.note} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />}
      {dialog?.kind === "links" && <LinksDialog note={dialog.note} projects={projects} contacts={contacts} onClose={() => setDialog(null)} onSave={async (values) => { const n = dialog.note; setDialog(null); await savePatch(n, values, "Bağlantılar kaydedildi."); setSelected(null); setTimeout(() => setSelected(n.id), 0); }} />}
    </div>
  );
}
