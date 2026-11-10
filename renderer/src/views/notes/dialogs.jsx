// Not Defteri (masaüstü) pencereleri: defter, şablon, paylaşım, sürüm geçmişi,
// görev / etkinlik oluşturma, proje ve kişi bağlama.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal, Spinner, useResult } from "../../components/ui";
import { get, post, patch, put, tempId } from "../../api";
import { formatDate, isoDay } from "../../lib/helpers";
import { TEMPLATES, lowerTr, notebookTree, plainText } from "../../lib/noteCore";
import MarkdownView from "./MarkdownView";
import { COLORS } from "./NoteEditor";

const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toLocaleUpperCase("tr-TR") || "?";
const NB_EMOJIS = ["📁", "🗂️", "📒", "📓", "📚", "🏟️", "⚽", "🏆", "💼", "🤝", "📣", "💡", "🗓️", "✅"];

export function NotebookDialog({ initial = {}, notebooks = [], onClose, onSaved, onDelete }) {
  const result = useResult();
  const editing = Boolean(initial.id);
  const [form, setForm] = useState({ name: "", emoji: null, color: null, parent_id: null, ...initial });
  const [busy, setBusy] = useState(false);
  const blocked = useMemo(() => {
    const out = new Set(editing ? [Number(initial.id)] : []);
    let grew = editing;
    while (grew) { grew = false; for (const nb of notebooks) if (nb.parent_id != null && out.has(Number(nb.parent_id)) && !out.has(Number(nb.id))) { out.add(Number(nb.id)); grew = true; } }
    return out;
  }, [editing, initial.id, notebooks]);
  const parents = notebookTree(notebooks).filter((nb) => !blocked.has(Number(nb.id)) && nb.depth < 2);
  const save = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    const body = { name: form.name, emoji: form.emoji, color: form.color, parent_id: form.parent_id };
    const res = editing ? await patch(`/api/tools/notes/notebooks/${initial.id}`, body) : await post("/api/tools/notes/notebooks", body, { tempId: tempId() });
    setBusy(false);
    if (result(res, editing ? "Defter kaydedildi." : "Defter oluşturuldu.")) onSaved(res.data?.item || { ...body, id: initial.id }, editing);
  };
  return (
    <Modal title={editing ? "Defteri düzenle" : "Yeni defter"} onClose={onClose} width={480} footer={<>
      {editing && <button type="button" className="btn btn--danger" onClick={() => onDelete(initial)}>Sil</button>}
      <span className="nt-spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="submit" form="nt-nb-form" className="btn btn--primary" disabled={busy || !form.name.trim()}>Kaydet</button>
    </>}>
      <form id="nt-nb-form" className="form-grid" onSubmit={save}>
        <Field label="Defter adı" className="span2"><input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Ör. Toplantılar, Lig 2026" /></Field>
        <Field label="Simge" className="span2">
          <div className="nt-emojirow">{NB_EMOJIS.map((em) => <button key={em} type="button" className={form.emoji === em ? "is-on" : ""} onClick={() => setForm({ ...form, emoji: form.emoji === em ? null : em })} aria-pressed={form.emoji === em}>{em}</button>)}</div>
        </Field>
        <Field label="Üst defter">
          <select value={form.parent_id ?? ""} onChange={(e) => setForm({ ...form, parent_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Yok (en üst düzey)</option>
            {parents.map((nb) => <option key={nb.id} value={nb.id}>{`${"— ".repeat(nb.depth)}${nb.name}`}</option>)}
          </select>
        </Field>
        <Field label="Renk">
          <div className="color-dots">{COLORS.map((c) => <button key={c || "none"} type="button" className={(form.color || "") === c ? "is-on" : ""} style={{ background: c || "var(--surface)" }} onClick={() => setForm({ ...form, color: c || null })} aria-label={c || "Renksiz"} />)}</div>
        </Field>
        {editing && <p className="muted small span2">Defter silinirse içindeki notlar ve alt defterler bir üst düzeye taşınır; notlar silinmez.</p>}
      </form>
    </Modal>
  );
}

export function TemplatePicker({ onPick, onClose }) {
  return (
    <Modal title="Şablondan yeni not" onClose={onClose} width={720}>
      <div className="nt-templates">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" className="nt-template" onClick={() => onPick(t.key)}>
            <span className="nt-template__emoji" aria-hidden="true">{t.emoji || "📄"}</span>
            <strong>{t.label}</strong><small>{t.description}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ShareDialog({ note, onClose, onSaved }) {
  const result = useResult();
  const [shares, setShares] = useState(null);
  const [initial, setInitial] = useState([]);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState([]);
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  useEffect(() => { get(`/api/tools/notes/${note.id}`).then((r) => { const s = r.ok ? r.data.item.shares || [] : []; setShares(s); setInitial(s); }); }, [note.id]);
  useEffect(() => { const t = setTimeout(() => get("/api/tools/notes/share-candidates", { q: q.trim() || undefined }).then((r) => setCands(r.ok ? r.data.items || [] : [])), 250); return () => clearTimeout(t); }, [q]);
  const chosen = new Set((shares || []).map((s) => Number(s.user_id)));
  const changed = JSON.stringify((shares || []).map((s) => [s.user_id, s.role])) !== JSON.stringify(initial.map((s) => [s.user_id, s.role]));
  const save = async () => {
    setBusy(true);
    const res = await put(`/api/tools/notes/${note.id}/shares`, { shares: shares.map((s) => ({ user_id: s.user_id, role: s.role })) });
    setBusy(false);
    if (result(res, "Paylaşım kaydedildi.")) onSaved(res.data?.shares || shares);
  };
  return (
    <Modal title={`"${note.title || "Başlıksız not"}" notunu paylaş`} onClose={onClose} width={600} footer={<>
      <span className="muted small">{shares?.length ? `${shares.length} kişiyle paylaşılıyor` : "Yalnız siz erişebilirsiniz"}</span>
      <span className="nt-spacer" />
      <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
      <button type="button" className="btn btn--primary" disabled={busy || !changed} onClick={save}>Paylaşımı kaydet</button>
    </>}>
      {shares == null ? <Spinner /> : (
        <div className="nt-share">
          <div className="row-gap">
            <div className="search-box search-box--full"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yönetim kullanıcısı ara" aria-label="Kullanıcı ara" /></div>
            <select className="select-sm" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Yetki"><option value="editor">Düzenleyebilir</option><option value="viewer">Görüntüleyebilir</option></select>
          </div>
          <div className="nt-people">
            {cands.filter((c) => !chosen.has(Number(c.id))).slice(0, 8).map((u) => (
              <button key={u.id} type="button" className="nt-person" onClick={() => setShares([...shares, { user_id: u.id, name: u.name, username: u.username, role }])}>
                <span className="avatar">{initials(u.name)}</span><span className="nt-person__main"><strong>{u.name}</strong><small>@{u.username}{u.city ? ` · ${u.city}` : ""}</small></span><span className="nt-person__cta">Ekle</span>
              </button>
            ))}
          </div>
          <h4 className="muted small">Erişimi olanlar</h4>
          {shares.length === 0 ? <p className="muted small">Henüz kimseyle paylaşılmadı.</p> : shares.map((s) => (
            <div key={s.user_id} className="nt-person">
              <span className="avatar">{initials(s.name)}</span><span className="nt-person__main"><strong>{s.name}</strong>{s.username && <small>@{s.username}</small>}</span>
              <select className="select-sm" value={s.role} onChange={(e) => setShares(shares.map((x) => (x.user_id === s.user_id ? { ...x, role: e.target.value } : x)))} aria-label={`${s.name} yetkisi`}><option value="editor">Düzenleyebilir</option><option value="viewer">Görüntüleyebilir</option></select>
              <button type="button" className="icon-btn" onClick={() => setShares(shares.filter((x) => x.user_id !== s.user_id))} aria-label={`${s.name} paylaşımını kaldır`}><Icon name="x" /></button>
            </div>
          ))}
          <p className="muted small">Paylaşılan kişinin Yapılacaklar listesine hatırlatma düşer. Paylaşım için bağlantı gerekir.</p>
        </div>
      )}
    </Modal>
  );
}

export function VersionsDialog({ note, readOnly, onClose, onRestored }) {
  const result = useResult();
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(null);
  useEffect(() => { get(`/api/tools/notes/${note.id}/versions`).then((r) => { const list = r.ok ? r.data.items || [] : []; setItems(list); setActive(list[0] || null); }); }, [note.id]);
  const restore = async () => {
    const res = await post(`/api/tools/notes/${note.id}/versions/${active.id}/restore`);
    if (result(res, "Sürüm geri yüklendi.")) onRestored(res.data.item);
  };
  const body = (v) => [v.body || "", ...(v.checklist || []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}`)].filter(Boolean).join("\n");
  return (
    <Modal title="Sürüm geçmişi" onClose={onClose} width={860} footer={<>
      <span className="muted small">Son 30 sürüm saklanır; geri yüklemeden önceki hâl de sürüm olarak kalır.</span>
      <span className="nt-spacer" />
      <button type="button" className="btn" onClick={onClose}>Kapat</button>
      {!readOnly && <button type="button" className="btn btn--primary" disabled={!active} onClick={restore}>Bu sürümü geri yükle</button>}
    </>}>
      {items == null ? <Spinner /> : items.length === 0 ? <p className="muted">Henüz önceki sürüm yok. Not düzenlendikçe sürümler burada birikir.</p> : (
        <div className="nt-versions">
          <ul className="nt-versions__list">{items.map((v) => <li key={v.id}><button type="button" className={active?.id === v.id ? "is-active" : ""} onClick={() => setActive(v)}><strong>{formatDate(v.createdAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</strong><small>{v.user_name || "—"} · {plainText(v.body).length} karakter</small></button></li>)}</ul>
          <div className="nt-versions__preview"><h3>{active?.title || "Başlıksız not"}</h3><MarkdownView text={active ? body(active) : ""} readOnly empty={<p className="muted">Bu sürüm boş.</p>} /></div>
        </div>
      )}
    </Modal>
  );
}

const firstLine = (text = "") => String(text || "").split("\n").map((l) => l.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#+\s+|>\s?)/, "").trim()).find(Boolean) || "";

export function TaskDialog({ note, selection = "", onClose, onDone }) {
  const result = useResult();
  const [title, setTitle] = useState(firstLine(selection) || note.title || "");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("normal");
  const save = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    const res = await post("/api/todos", { kind: due ? "reminder" : "task", title: title.trim(), body: `Not Defteri: ${note.title || "Başlıksız not"}${selection.trim() ? `\n\n${selection.trim()}` : ""}`, due_at: due ? new Date(due).toISOString() : null, priority }, { tempId: tempId() });
    if (result(res, "Görev Yapılacaklar listesine eklendi.")) onDone();
  };
  return (
    <Modal title="Yapılacaklar'a görev ekle" onClose={onClose} width={480} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="nt-task" className="btn btn--primary" disabled={!title.trim()}>Görevi ekle</button></>}>
      <form id="nt-task" className="form-grid" onSubmit={save}>
        <Field label="Görev" className="span2"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
        <Field label="Son tarih (isteğe bağlı)"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Öncelik"><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option></select></Field>
      </form>
    </Modal>
  );
}

export function EventDialog({ note, onClose, onDone }) {
  const result = useResult();
  const [title, setTitle] = useState(note.title || "");
  const [day, setDay] = useState(isoDay());
  const [start, setStart] = useState("10:00");
  const [minutes, setMinutes] = useState(60);
  const save = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    const startAt = new Date(`${day}T${start}`);
    const res = await post("/api/tools/events", { title: title.trim(), description: `Not Defteri: ${note.title || "Başlıksız not"}\n\n${plainText(note.body).slice(0, 2000)}`, start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + Number(minutes) * 60000).toISOString(), all_day: false, category: "general", remind_minutes: 30 }, { tempId: tempId() });
    if (result(res, "Etkinlik ajandaya eklendi.")) onDone();
  };
  return (
    <Modal title="Ajandaya etkinlik ekle" onClose={onClose} width={480} footer={<><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="submit" form="nt-event" className="btn btn--primary" disabled={!title.trim()}>Etkinliği ekle</button></>}>
      <form id="nt-event" className="form-grid" onSubmit={save}>
        <Field label="Başlık" className="span2"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
        <Field label="Gün"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Başlangıç"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Süre"><select value={minutes} onChange={(e) => setMinutes(e.target.value)}>{[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} dk` : `${m / 60} saat`}</option>)}</select></Field>
      </form>
    </Modal>
  );
}

export function LinksDialog({ note, projects = [], contacts = [], onClose, onSave }) {
  const [projectId, setProjectId] = useState(note.project_id ?? "");
  const [ids, setIds] = useState(() => new Set((note.contact_ids || []).map(Number)));
  const [q, setQ] = useState("");
  const list = contacts.filter((c) => !q || lowerTr(`${c.name} ${c.company || ""}`).includes(lowerTr(q))).slice(0, 80);
  const toggle = (id) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 20) n.add(id); return n; });
  return (
    <Modal title="Proje ve kişi bağla" onClose={onClose} width={560} footer={<><span className="muted small">{ids.size} kişi seçili</span><span className="nt-spacer" /><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button type="button" className="btn btn--primary" onClick={() => onSave({ project_id: projectId ? Number(projectId) : null, contact_ids: [...ids] })}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Proje" className="span2"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Proje yok</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="span2"><div className="search-box search-box--full"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rehberde kişi ara" aria-label="Kişi ara" /></div></div>
        <div className="span2 nt-pick">
          {list.length === 0 ? <p className="muted small">Rehberinizde eşleşen kişi yok.</p> : list.map((c) => (
            <label key={c.id} className={`nt-pick__row${ids.has(Number(c.id)) ? " is-on" : ""}`}><input type="checkbox" checked={ids.has(Number(c.id))} onChange={() => toggle(Number(c.id))} /><span className="avatar">{initials(c.name)}</span><span><strong>{c.name}</strong>{c.company && <small> · {c.company}</small>}</span></label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

