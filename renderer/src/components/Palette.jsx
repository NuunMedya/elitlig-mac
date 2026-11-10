// Komut paleti (⌘K): araçlara geçiş, hızlı eylemler ve tüm araçlarda arama
// (görevler, notlar, kişiler, tablolar, muhasebe kayıtları, sohbetler ve
// mesaj gönderilebilecek kişiler).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, keyLabel } from "./ui";
import { get, useDebounced } from "../api";
import { includesTr, formatMoney, formatDate } from "../lib/helpers";
// Yönetim: web yönetim panelinin sayfaları ve maç / oyuncu / takım araması (views/admin).
import { useAdminPalette } from "../views/admin/adminPalette";

const ACTIONS = [
  { label: "Yeni sohbet", icon: "message", route: "messages:new", hint: "Mesajlar · ⌘N" },
  { label: "Yeni grup", icon: "users", route: "messages:newGroup", hint: "Mesajlar · ⇧⌘N" },
  { label: "Yeni görev", icon: "plus", route: "todos:new", hint: "Yapılacaklar" },
  { label: "Yeni not", icon: "plus", route: "notes:new", hint: "Not Defteri" },
  { label: "Şablondan yeni not (toplantı, maç raporu, saha keşfi…)", icon: "layers", route: "notes:template", hint: "Not Defteri" },
  { label: "Yeni etkinlik", icon: "plus", route: "agenda:new", hint: "Ajanda" },
  { label: "Yeni proje", icon: "plus", route: "projects:new", hint: "Projeler" },
  { label: "Projelerde bugün aranacaklar", icon: "phone", route: "projects", arg: { section: "followups" }, hint: "Projeler · Takip" },
  { label: "Portföy", icon: "briefcase", route: "projects", arg: { section: "portfolio" }, hint: "Projeler" },
  { label: "Yeni gelir/gider kaydı", icon: "plus", route: "ledger:new", hint: "Ön Muhasebe" },
  { label: "Düzenli ödemeler (fatura, maaş, kira)", icon: "repeat", route: "ledger:duzenli", hint: "Muhasebe" },
  { label: "Bütçe", icon: "target", route: "ledger:butce", hint: "Muhasebe" },
  { label: "Yeni tablo", icon: "plus", route: "sheets:new", hint: "Tablolar" },
  { label: "Yeni kişi", icon: "plus", route: "contacts:new", hint: "Rehber" },
  { label: "Yeni ekipman", icon: "box", route: "equipment:new", hint: "Ekipman" },
  { label: "Kimde ne var (zimmetler)", icon: "user", route: "equipment:zimmet", hint: "Ekipman" },
  { label: "Ekipman rezervasyonları", icon: "calendar", route: "equipment:rezervasyon", hint: "Ekipman" },
  { label: "Bakım takvimi ve arızalar", icon: "wrench", route: "equipment:bakim", hint: "Ekipman" },
  { label: "Odak turunu başlat", icon: "play", run: () => window.elitlig.focus.command("start"), hint: "Odak Sayacı" },
  { label: "Hızlı kayıt penceresi", icon: "zap", run: () => window.elitlig.quick.show(), hint: "⌃⌥N" },
  // Dosya Araçları ve raflar
  { label: "Dosya dönüştür / düzenle", icon: "folder", route: "files", hint: "Dosya Araçları · ⇧⌘D" },
  { label: "Panodaki dosyayı Dosya Araçları'na yapıştır", icon: "copy", route: "files:paste", hint: "Dosya Araçları" },
  { label: "Float rafını aç", icon: "paperclip", run: () => window.elitlig.float.show(), hint: "Dosya Araçları" },
  { label: "Rafları aç (ekran görüntüleri, pano)", icon: "layers", run: () => window.elitlig.shelf.show(), hint: "⌃⌥T" },
  { label: "Raflarda ara", icon: "search", run: () => window.elitlig.shelf.show({ search: true }), hint: "⌃⌥S" },
  { label: "Ekranı yakala", icon: "camera", run: () => window.elitlig.shelf.capture(), hint: "⌃⌥A" },
  { label: "Ekran görüntüleri kütüphanesi", icon: "image", route: "shelf", hint: "⇧⌘P" },
  { label: "Raf ayarları (kaynaklar, saklama, kısayollar)", icon: "sliders", route: "shelf:settings", hint: "Ekran Görüntüleri" },
];

export default function Palette({ onClose, go, routes }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [content, setContent] = useState([]);
  const query = useDebounced(q, 150);
  const inputRef = useRef(null);
  const sources = useRef(null);

  // İçerik araması için veriler bir kez okunur (bağlantı yoksa önbellekten).
  // Kapanınca odak paleti açan öğeye döner.
  useEffect(() => {
    const opener = document.activeElement;
    return () => { if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
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
      get("/api/tools/equipment/items", { page_size: 500, include_retired: "1" }),
    ]).then(([todos, notes, contacts, sheets, ledger, projects, follow, chats, people, equipment]) => {
      sources.current = {
        todos: todos.ok ? todos.data?.items || [] : [],
        notes: notes.ok ? notes.data?.items || [] : [],
        notebooks: notes.ok ? notes.data?.notebooks || [] : [],
        contacts: contacts.ok ? contacts.data?.items || [] : [],
        sheets: sheets.ok ? sheets.data?.items || [] : [],
        ledger: ledger.ok ? ledger.data?.items || [] : [],
        projects: projects.ok ? projects.data?.items || [] : [],
        leads: follow.ok ? follow.data?.leads || [] : [],
        chats: chats.ok ? chats.data?.conversations || [] : [],
        people: people.ok ? [...(people.data?.staff || []), ...(people.data?.managers || []), ...(people.data?.players || [])] : [],
        equipment: equipment.ok ? equipment.data?.items || [] : [],
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
    (s.notebooks || []).filter((nb) => includesTr(nb.name, query)).slice(0, 4).forEach((nb) => out.push({ label: `${nb.emoji ? `${nb.emoji} ` : ""}${nb.name}`, icon: "folder", hint: "Defter", route: "notes", arg: { notebook: nb.id } }));
    s.contacts.filter((c) => includesTr(`${c.name} ${c.company} ${c.phone} ${c.email} ${c.city}`, query)).slice(0, 6).forEach((c) => out.push({ label: c.name, icon: "user", hint: c.phone || c.company || "Kişi", route: `contacts:${c.id}` }));
    s.sheets.filter((x) => includesTr(x.title, query)).slice(0, 5).forEach((x) => out.push({ label: x.title, icon: "grid", hint: "Tablo", route: `sheets:${x.id}` }));
    s.projects.filter((p) => includesTr(`${p.name} ${p.description}`, query)).slice(0, 5).forEach((p) => out.push({ label: p.name, icon: "layers", hint: `Proje · %${p.stats?.steps?.progress ?? 0}`, route: "projects", arg: { id: p.id } }));
    s.leads.filter((l) => includesTr(`${l.name} ${l.company} ${l.phone}`, query)).slice(0, 5).forEach((l) => out.push({ label: l.name, icon: "phone", hint: `${l.project_name} · ${l.stage_label}`, route: "projects", arg: { id: l.project_id, tab: "leads", lead: l.id } }));
    s.ledger.filter((e) => includesTr(`${e.description} ${e.party} ${e.category} ${e.document_no}`, query)).slice(0, 5).forEach((e) => out.push({ label: e.description || e.party || e.category || "Kayıt", icon: "receipt", hint: `${formatDate(e.entry_date)} · ${formatMoney(e.amount)}`, route: `ledger:${e.id}` }));
    (s.equipment || []).filter((e) => includesTr(`${e.asset_tag} ${e.name} ${e.brand} ${e.model} ${e.serial_no} ${e.barcode} ${e.holder?.name || ""}`, query)).slice(0, 6).forEach((e) => out.push({ label: e.name, icon: "box", hint: `Ekipman · ${e.asset_tag}${e.holder?.name ? ` · ${e.holder.name}` : e.location_path ? ` · ${e.location_path}` : ""}`, route: "equipment", arg: { id: e.id } }));
    setContent(out);
  }, [query]);

  const admin = useAdminPalette(q);
  // Gruplar: Araçlar · Komutlar · Sonuçlar (arama yapılınca içerik eşleşmeleri).
  const items = useMemo(() => {
    const match = (item) => !q.trim() || includesTr(`${item.label} ${item.hint}`, q);
    const nav = routes.map((r) => ({ label: r.label, icon: r.icon, route: r.key, hint: keyLabel(r.shortcut), group: "Araçlar" })).filter(match);
    const actions = ACTIONS.map((a) => ({ ...a, hint: keyLabel(a.hint), group: "Komutlar" })).filter(match);
    const toAdmin = (e) => ({ ...e, route: "admin", arg: { path: e.path } });
    return [...nav, ...actions, ...admin.pages.map(toAdmin), ...content.map((c) => ({ ...c, group: "Sonuçlar" })), ...admin.content.map(toAdmin)];
  }, [q, content, routes, admin]);

  useEffect(() => setIndex(0), [q]);
  // Klavyeyle seçilen satır görünür alanda kalır.
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector(`#palette-opt-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index, items.length]);

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else go(item.route, item.arg);
  };

  const onKey = (e) => {
    const last = items.length - 1;
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); setIndex((i) => (i >= last ? 0 : i + 1)); }
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); setIndex((i) => (i <= 0 ? Math.max(0, last) : i - 1)); }
    else if (e.key === "PageDown") { e.preventDefault(); setIndex((i) => Math.min(last, i + 8)); }
    else if (e.key === "PageUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 8)); }
    else if ((e.key === "Home" || e.key === "End") && e.altKey) { e.preventDefault(); setIndex(e.key === "Home" ? 0 : Math.max(0, last)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[index]); }
    else if (e.key === "Escape") onClose();
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Komut paleti">
        <div className="palette__input">
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Araç, komut ya da sohbet, kişi, görev, not, proje, tablo ara…" aria-label="Ara"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant={items.length ? `palette-opt-${index}` : undefined} />
          <Kbd>esc</Kbd>
        </div>
        <ul className="palette__list" role="listbox" id="palette-list" aria-label="Sonuçlar" ref={listRef}>
          {items.map((item, i) => (
            <React.Fragment key={`${item.route || item.label}-${i}`}>
              {(i === 0 || items[i - 1].group !== item.group) && <li className="palette__group" role="presentation">{item.group}</li>}
              <li id={`palette-opt-${i}`} role="option" aria-selected={i === index} className={i === index ? "is-active" : ""} onMouseMove={() => { if (i !== index) setIndex(i); }} onMouseDown={(e) => { e.preventDefault(); run(item); }}>
                <span className="palette__icon"><Icon name={item.icon} size={14} /></span>
                <span className="palette__label">{item.label}</span>
                {item.hint && <span className="palette__hint">{item.hint}</span>}
              </li>
            </React.Fragment>
          ))}
          {!items.length && <li className="palette__empty" role="presentation">{q.trim().length >= 2 ? `“${q.trim()}” için sonuç yok` : "Sonuç yok"}</li>}
        </ul>
        <div className="palette__foot" aria-hidden="true">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> gez</span>
          <span><Kbd>↩</Kbd> aç</span>
          <span><Kbd>esc</Kbd> kapat</span>
          <span className="spacer" />
          <span>{q.trim().length >= 2 ? `${items.length} sonuç` : "İçerikte aramak için en az 2 harf"}</span>
        </div>
      </div>
    </div>
  );
}
