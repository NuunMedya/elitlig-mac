// Komut paleti (⌘K): araçlara geçiş, hızlı eylemler ve tüm araçlarda arama
// (görevler, notlar, kişiler, tablolar, muhasebe kayıtları, sohbetler ve
// mesaj gönderilebilecek kişiler).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd } from "./ui";
import { get, useDebounced } from "../api";
import { includesTr, formatMoney, formatDate } from "../lib/helpers";

const ACTIONS = [
  { label: "Yeni sohbet", icon: "message", route: "messages:new", hint: "Mesajlar · ⌘N" },
  { label: "Yeni grup", icon: "users", route: "messages:newGroup", hint: "Mesajlar · ⇧⌘N" },
  { label: "Yeni görev", icon: "plus", route: "todos:new", hint: "Yapılacaklar" },
  { label: "Yeni not", icon: "plus", route: "notes:new", hint: "Not Defteri" },
  { label: "Yeni etkinlik", icon: "plus", route: "agenda:new", hint: "Ajanda" },
  { label: "Yeni proje", icon: "plus", route: "projects:new", hint: "Projeler" },
  { label: "Projelerde bugün aranacaklar", icon: "phone", route: "projects", arg: { section: "followups" }, hint: "Projeler · Takip" },
  { label: "Portföy", icon: "briefcase", route: "projects", arg: { section: "portfolio" }, hint: "Projeler" },
  { label: "Yeni gelir/gider kaydı", icon: "plus", route: "ledger:new", hint: "Ön Muhasebe" },
  { label: "Yeni tablo", icon: "plus", route: "sheets:new", hint: "Tablolar" },
  { label: "Yeni kişi", icon: "plus", route: "contacts:new", hint: "Rehber" },
  { label: "Odak turunu başlat", icon: "play", run: () => window.elitlig.focus.command("start"), hint: "Odak Sayacı" },
  { label: "Hızlı kayıt penceresi", icon: "zap", run: () => window.elitlig.quick.show(), hint: "⌃⌥N" },
];

export default function Palette({ onClose, go, routes }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [content, setContent] = useState([]);
  const query = useDebounced(q, 150);
  const inputRef = useRef(null);
  const sources = useRef(null);

  // İçerik araması için veriler bir kez okunur (bağlantı yoksa önbellekten).
  useEffect(() => {
    inputRef.current?.focus();
    Promise.all([
      get("/api/todos", { view: "mine", status: "all" }),
      get("/api/tools/notes", { archived: "all" }),
      get("/api/tools/contacts"),
      get("/api/tools/sheets"),
      get("/api/tools/ledger", {}),
      get("/api/tools/projects", { archived: "all" }),
      get("/api/tools/projects/followups", { days: 30 }),
      get("/api/chat/conversations"),
      get("/api/chat/directory"),
    ]).then(([todos, notes, contacts, sheets, ledger, projects, follow, chats, people]) => {
      sources.current = {
        todos: todos.ok ? todos.data?.items || [] : [],
        notes: notes.ok ? notes.data?.items || [] : [],
        contacts: contacts.ok ? contacts.data?.items || [] : [],
        sheets: sheets.ok ? sheets.data?.items || [] : [],
        ledger: ledger.ok ? ledger.data?.items || [] : [],
        projects: projects.ok ? projects.data?.items || [] : [],
        leads: follow.ok ? follow.data?.leads || [] : [],
        chats: chats.ok ? chats.data?.conversations || [] : [],
        people: people.ok ? [...(people.data?.staff || []), ...(people.data?.managers || []), ...(people.data?.players || [])] : [],
      };
      setContent((c) => [...c]);
    });
  }, []);

  useEffect(() => {
    const s = sources.current;
    if (!s || query.trim().length < 2) { setContent([]); return; }
    const out = [];
    const chatUsers = new Set();
    s.chats.filter((c) => includesTr(`${c.title} ${c.subtitle} ${c.other_user?.team_name || ""}`, query)).slice(0, 6).forEach((c) => {
      if (c.other_user?.user_id) chatUsers.add(Number(c.other_user.user_id));
      out.push({ label: c.title, icon: "message", hint: `Sohbet${c.unread ? ` · ${c.unread} okunmamış` : ""}${c.other_user?.team_name && c.other_user.team_name !== c.title ? ` · ${c.other_user.team_name}` : ""}`, route: "messages", arg: { conversationId: c.id } });
    });
    const seenPeople = new Set();
    s.people.filter((p) => !chatUsers.has(Number(p.user_id)) && includesTr(`${p.name} ${p.team_name || ""} ${p.username || ""}`, query)).forEach((p) => {
      if (seenPeople.has(p.user_id) || seenPeople.size >= 6) return;
      seenPeople.add(p.user_id);
      out.push({ label: p.name, icon: "user", hint: `Mesaj gönder · ${p.team_name && p.team_name !== p.name ? p.team_name : p.subtitle || ""}`, route: "messages", arg: { userId: p.user_id } });
    });
    s.todos.filter((t) => includesTr(`${t.title} ${t.body}`, query)).slice(0, 6).forEach((t) => out.push({ label: t.title, icon: "checkSquare", hint: t.status === "done" ? "Tamamlandı" : t.dueAt ? formatDate(t.dueAt) : "Yapılacaklar", route: `todos:${t.id}` }));
    s.notes.filter((n) => includesTr(`${n.title} ${n.body} ${(n.tags || []).join(" ")} ${(n.checklist || []).map((c) => c.text).join(" ")}`, query)).slice(0, 6).forEach((n) => out.push({ label: n.title || (n.body || "Not").slice(0, 60), icon: "note", hint: "Not", route: `notes:${n.id}` }));
    s.contacts.filter((c) => includesTr(`${c.name} ${c.company} ${c.phone} ${c.email} ${c.city}`, query)).slice(0, 6).forEach((c) => out.push({ label: c.name, icon: "user", hint: c.phone || c.company || "Kişi", route: `contacts:${c.id}` }));
    s.sheets.filter((x) => includesTr(x.title, query)).slice(0, 5).forEach((x) => out.push({ label: x.title, icon: "grid", hint: "Tablo", route: `sheets:${x.id}` }));
    s.projects.filter((p) => includesTr(`${p.name} ${p.description}`, query)).slice(0, 5).forEach((p) => out.push({ label: p.name, icon: "layers", hint: `Proje · %${p.stats?.steps?.progress ?? 0}`, route: "projects", arg: { id: p.id } }));
    s.leads.filter((l) => includesTr(`${l.name} ${l.company} ${l.phone}`, query)).slice(0, 5).forEach((l) => out.push({ label: l.name, icon: "phone", hint: `${l.project_name} · ${l.stage_label}`, route: "projects", arg: { id: l.project_id, tab: "leads", lead: l.id } }));
    s.ledger.filter((e) => includesTr(`${e.description} ${e.party} ${e.category} ${e.document_no}`, query)).slice(0, 5).forEach((e) => out.push({ label: e.description || e.party || e.category || "Kayıt", icon: "receipt", hint: `${formatDate(e.entry_date)} · ${formatMoney(e.amount)}`, route: `ledger:${e.id}` }));
    setContent(out);
  }, [query]);

  const items = useMemo(() => {
    const nav = routes.map((r) => ({ label: r.label, icon: r.icon, route: r.key, hint: r.shortcut }));
    const base = [...nav, ...ACTIONS].filter((item) => !q.trim() || includesTr(`${item.label} ${item.hint}`, q));
    return [...base, ...content];
  }, [q, content, routes]);

  useEffect(() => setIndex(0), [q]);

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else go(item.route, item.arg);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[index]); }
    else if (e.key === "Escape") onClose();
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-label="Komut paleti">
        <div className="palette__input">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Araç, komut ya da sohbet, kişi, görev, not, proje, tablo ara…" aria-label="Ara" />
          <Kbd>esc</Kbd>
        </div>
        <ul className="palette__list" role="listbox">
          {items.map((item, i) => (
            <li key={`${item.route || item.label}-${i}`} role="option" aria-selected={i === index} className={i === index ? "is-active" : ""} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => { e.preventDefault(); run(item); }}>
              <Icon name={item.icon} size={15} />
              <span className="palette__label">{item.label}</span>
              <span className="palette__hint">{item.hint}</span>
            </li>
          ))}
          {!items.length && <li className="palette__empty">Sonuç yok</li>}
        </ul>
      </div>
    </div>
  );
}
