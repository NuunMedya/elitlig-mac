// Komut paletinin (⌘K) içerik araması — paylaşılan: palet (components/Palette.jsx) ve masaüstü
// hızlı geçiş penceresi (launcher/Launcher.jsx) aynı kaynakları okur, aynı sonuçları üretir.
// Sonuç: { label, icon, hint, route, arg? } — go(route, arg) ile açılır.
import { includesTr, formatMoney, formatDate } from "./helpers";

/** Aranacak veriler (bağlantı yoksa api önbelleğinden). get: (path, query) => Promise<{ ok, data }> */
export function loadSearchSources(get) {
  return Promise.all([
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
  ]).then(([todos, notes, contacts, sheets, ledger, projects, follow, chats, people, equipment]) => ({
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
  }));
}

/** Kaynaklarda arama (en az 2 harf). */
export function searchSources(s, query) {
  if (!s || String(query || "").trim().length < 2) return [];
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
  return out;
}
